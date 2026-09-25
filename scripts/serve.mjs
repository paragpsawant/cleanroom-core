// Local static server for cleanroom-ai apps, with the same headers a Hugging Face static Space uses.
//   node node_modules/@cleanroom-ai/core/scripts/serve.mjs [appDir]      (PORT env, default 8080)
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] || process.cwd());
const port = Number(process.env.PORT || 8080);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".webm": "video/webm", ".mp4": "video/mp4",
  ".log": "text/plain; charset=utf-8", ".har": "application/json",
};
const blocked = /^[\\/](node_modules|\.cache|tests|scripts|\.git)([\\/]|$)/;

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = join(root, path.endsWith("/") || path.endsWith("\\") ? join(path, "index.html") : path);
  let st = null;
  try {
    st = statSync(file);
  } catch {
    st = null;
  }
  if (!file.startsWith(root) || blocked.test(path) || !st?.isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": types[extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": st.size,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "no-cache",
  });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} at http://127.0.0.1:${port}`));
