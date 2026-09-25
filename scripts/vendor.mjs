// Shared build step for cleanroom-ai apps: copy runtime libraries and models into the app so the
// deployed page never requests anything from a CDN or third-party host.
//
//   import { vendorCore } from "@cleanroom-ai/core/scripts/vendor.mjs";
//   vendorCore({ appDir, models: ["ocr", "faces", "pii"], libs: ["ort", "transformers", "jsqr"] });

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const MODEL_SETS = {
  ocr: ["ocr_det.onnx", "ocr_rec.onnx", "ocr_keys.json"],
  faces: ["yunet.onnx"],
  pii: ["pii/config.json", "pii/tokenizer.json", "pii/tokenizer_config.json", "pii/onnx/model_quantized.onnx"],
};

/** Resolve an installed package directory, from the app first, then from core. */
export function pkgDir(name, appDir) {
  for (const from of [appDir, coreDir]) {
    try {
      const req = createRequire(join(from, "package.json"));
      return dirname(req.resolve(`${name}/package.json`));
    } catch {
      // try next
    }
  }
  throw new Error(`package ${name} is not installed`);
}

export function copy(src, dst, quiet = false) {
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
  if (!quiet) console.log("  ", dst);
}

export function vendorCore({ appDir, models = [], libs = ["ort"] }) {
  const out = (...p) => join(appDir, ...p);
  const lic = out("licenses");
  mkdirSync(lic, { recursive: true });

  // The app's JS imports the engine from vendor/core/ (served as static files).
  copy(join(coreDir, "src"), out("vendor", "core"));
  copy(join(coreDir, "theme", "theme.css"), out("vendor", "core", "theme.css"));

  if (libs.includes("ort") || libs.includes("transformers")) {
    const tf = pkgDir("@huggingface/transformers", appDir);
    // Use the ONNX Runtime build that transformers.js was released against.
    const ortPkg = [join(tf, "node_modules", "onnxruntime-web"), pkgDir("onnxruntime-web", appDir)].find(existsSync);
    for (const f of ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
      copy(join(ortPkg, "dist", f), out("vendor", "ort", f));
    }
    const ortVersion = JSON.parse(readFileSync(join(ortPkg, "package.json"), "utf8")).version;
    writeFileSync(join(lic, "onnxruntime-web.txt"), MIT("onnxruntime-web " + ortVersion, "Microsoft Corporation"));
    if (libs.includes("transformers")) {
      // transformers.js imports ONNX Runtime by bare name; workers can't use import maps.
      const src = readFileSync(join(tf, "dist", "transformers.web.min.js"), "utf8")
        .replaceAll(/from\s*["']onnxruntime-web\/webgpu["']/g, 'from"./ort/ort.wasm.min.mjs"')
        .replaceAll(/from\s*["']onnxruntime-web["']/g, 'from"./ort/ort.wasm.min.mjs"')
        .replaceAll(/from\s*["']onnxruntime-common["']/g, 'from"./ort/ort.wasm.min.mjs"');
      if (/from\s*["']onnxruntime-/.test(src)) throw new Error("transformers bundle still imports onnxruntime by bare name");
      mkdirSync(out("vendor"), { recursive: true });
      writeFileSync(out("vendor", "transformers.web.min.js"), src);
      copy(join(tf, "LICENSE"), join(lic, "transformers.js.txt"), true);
    }
  }
  if (libs.includes("jsqr")) {
    const jq = pkgDir("jsqr", appDir);
    copy(join(jq, "dist", "jsQR.js"), out("vendor", "jsQR.js"));
    copy(join(jq, "LICENSE"), join(lic, "jsQR.txt"), true);
  }

  for (const set of models) {
    for (const f of MODEL_SETS[set] ?? [set]) copy(join(coreDir, "models", f), out("models", f), true);
  }
  if (models.includes("faces")) copy(join(coreDir, "models", "LICENSES", "yunet.txt"), out("models", "LICENSES", "yunet.txt"), true);
  if (models.length) console.log(`   models: ${models.join(", ")}`);
}

export function MIT(what, holder) {
  return `${what} — MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.
`;
}
