// Engine loading helpers for Web Workers: progress-reporting fetch of bundled model files and
// lazy creation of the OCR / face / name engines. Every file comes from the app's own origin.

import { FaceDetector } from "./faces.js";
import { createNer } from "./ner.js";
import { OCR } from "./ocr.js";

/**
 * @param base       URL of the app root (e.g. new URL("../", import.meta.url))
 * @param onProgress ({label, loaded, total}) => void
 */
export function makeLoaders(base, onProgress = () => {}) {
  async function fetchBytes(path, label = path) {
    const res = await fetch(new URL(path, base));
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    const total = Number(res.headers.get("content-length")) || 0;
    if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const buf = new Uint8Array(total);
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (got + value.length > buf.length) {
        // content-length was the compressed size; fall back to growing.
        const bigger = new Uint8Array(Math.max(buf.length * 2, got + value.length));
        bigger.set(buf.subarray(0, got));
        return finish(bigger, got, value, reader, label, total);
      }
      buf.set(value, got);
      got += value.length;
      onProgress({ label, loaded: got, total });
    }
    return buf.subarray(0, got);
  }

  async function finish(buf, got, value, reader, label, total) {
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
  return {
    ocr: () => (ocr ??= OCR.create(ort, loadBytes, loadJson)),
    faces: () => (faces ??= FaceDetector.create(ort, loadBytes)),
    ner: () => (ner ??= importTransformers().then((transformers) => {
      transformers.env.useBrowserCache = true;
      return createNer(transformers, {
        // A path, not a full URL: transformers.js only checks local files for non-http(s) paths.
        localModelPath: new URL("models/", base).pathname, wasmPaths: wasmPath, device: "wasm",
      });
    })),
  };
}

/** Configure the vendored ONNX Runtime for workers (single-threaded: reliable and fast enough). */
export function configureOrt(ort, wasmPath) {
  ort.env.wasm.wasmPaths = wasmPath;
  ort.env.wasm.numThreads = 1;
  return ort;
}
