// Engine loading helpers for Web Workers: progress-reporting fetch of bundled model files and
// lazy creation of the OCR / face / name engines. Every file comes from the app's own origin.

import { FaceDetector } from "./faces.js";
import { createNer } from "./ner.js";
import { OCR } from "./ocr.js";

const MODEL_CACHE = "cleanroom-ai-models-v1";

async function openModelCache() {
  try {
    return globalThis.caches?.open ? await globalThis.caches.open(MODEL_CACHE) : null;
  } catch {
    return null;
  }
}

async function fetchCachedResponse(url) {
  const request = new Request(url);
  const cache = await openModelCache();
  if (cache) {
    try {
      const hit = await cache.match(request);
      if (hit) return hit;
    } catch {
      // Cache Storage is best-effort; never block model loading on it.
    }
  }
  const res = await fetch(request);
  if (cache && res.ok) {
    try {
      await cache.put(request, res.clone());
    } catch {
      // Signed redirects and quota limits can make puts fail; the network response is still usable.
    }
  }
  return res;
}

async function responseBytes(res, label, onProgress) {
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const buf = new Uint8Array(total);
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > buf.length) {
      const bigger = new Uint8Array(Math.max(buf.length * 2, got + value.length));
      bigger.set(buf.subarray(0, got));
      return finish(bigger, got, value, reader, label, total, onProgress);
    }
    buf.set(value, got);
    got += value.length;
    onProgress({ label, loaded: got, total });
  }
  return buf.subarray(0, got);
}

async function finish(buf, got, value, reader, label, total, onProgress) {
  const chunks = [buf.subarray(0, got), value];
  let size = got + value.length;
  for (;;) {
    const { done, value: v } = await reader.read();
    if (done) break;
    chunks.push(v);
    size += v.length;
    onProgress({ label, loaded: Math.min(size, total), total });
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function fetchUrlBytes(url, label, onProgress) {
  const res = await fetchCachedResponse(url);
  if (!res.ok) throw new Error(`Could not load ${label} (${res.status})`);
  return responseBytes(res, label, onProgress);
}

/**
 * @param base       URL of the app root (e.g. new URL("../", import.meta.url))
 * @param onProgress ({label, loaded, total}) => void
 */
export function makeLoaders(base, onProgress = () => {}) {
  async function fetchBytes(path, label = path) {
    return fetchUrlBytes(new URL(path, base), label, onProgress);
  }

  const loadBytes = (f) => fetchBytes(`models/${f}`, f);
  const loadJson = async (f) => JSON.parse(new TextDecoder().decode(await fetchBytes(`models/${f}`, f)));
  return { fetchBytes, loadBytes, loadJson };
}

/**
 * Lazily-created engines shared by a worker. `ort` is the vendored ONNX Runtime module;
 * `importTransformers` returns the vendored transformers.js module (only needed for names).
 */
export function createEngineCache({ ort, base, onProgress, importTransformers, wasmPath }) {
  const { loadBytes, loadJson } = makeLoaders(base, onProgress);
  let ocr, faces, ner;
  let wasmReady;
  const ensureOrtWasm = () => (wasmReady ??= loadOrtWasmBinary(ort, wasmPath, base, onProgress));
  return {
    ocr: () => (ocr ??= ensureOrtWasm().then(() => OCR.create(ort, loadBytes, loadJson))),
    faces: () => (faces ??= ensureOrtWasm().then(() => FaceDetector.create(ort, loadBytes))),
    ner: () => (ner ??= importTransformers().then((transformers) => {
      transformers.env.useBrowserCache = true;
      return createNer(transformers, {
        // A path, not a full URL: transformers.js only checks local files for non-http(s) paths.
        localModelPath: new URL("models/", base).pathname, wasmPaths: wasmPath, device: "wasm",
      });
    })),
  };
}

async function loadOrtWasmBinary(ort, wasmPath, base, onProgress = () => {}) {
  if (!ort?.env?.wasm || !wasmPath || ort.env.wasm.wasmBinary) return;
  const root = new URL(wasmPath, base);
  const urls = root.pathname.endsWith(".wasm")
    ? [root]
    : ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd.wasm", "ort-wasm.wasm"].map((f) => new URL(f, root));
  for (const url of urls) {
    try {
      const bytes = await fetchUrlBytes(url, url.pathname.split("/").pop(), onProgress);
      ort.env.wasm.wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return;
    } catch {
      // Fall back to ORT's own wasm fetch when this version/path cannot use a preloaded binary.
    }
  }
}

/** Configure the vendored ONNX Runtime for workers (single-threaded: reliable and fast enough). */
export function configureOrt(ort, wasmPath) {
  ort.env.wasm.wasmPaths = wasmPath;
  ort.env.wasm.numThreads = 1;
  return ort;
}
