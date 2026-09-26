# @cleanroom-ai/core

[![CI](https://github.com/cleanroom-ai/cleanroom-core/actions/workflows/ci.yml/badge.svg)](https://github.com/cleanroom-ai/cleanroom-core/actions/workflows/ci.yml)

Shared in-browser engine behind the [cleanroom-ai](https://github.com/cleanroom-ai) tools: *clean it
before you share it*, 100% on your device.

| Module | What |
|---|---|
| `src/rules.js` | Secret & PII rules with checksums (API keys, passwords incl. spaces, emails, phones, cards, IBANs, SSNs, IPs, chat-header names, …) |
| `src/ner.js` | On-device PII token classifier (bert-small-pii, int8) with span clean-up |
| `src/ocr.js` | PP-OCRv6 tiny text detection + recognition with per-character positions |
| `src/faces.js` | YuNet face detection, with full-resolution tiles for small avatars |
| `src/pipeline.js` | Image scan: OCR → rows → rules + names → pixel boxes; faces |
| `src/redact.js` | Canvas rendering: black box / pixelate / blur, numbered review overlay |
| `src/codes.js` | QR / barcode detection (BarcodeDetector or bundled jsQR) |
| `src/engines.js` | Worker helpers: progress fetch of bundled models, lazy engines, ORT config |
| `scripts/vendor.mjs` | Copies libraries + models into an app (no CDN at runtime) |
| `scripts/serve.mjs` | Local static server with Space-like headers |
| `scripts/render-icons.mjs` | App icon set, favicon.ico and 1280×640 social card from two SVGs |
| `testing/browser.mjs` | Real-browser harness that fails on any upload or third-party request |
| `theme/theme.css` | Shared look |

Everything runs on ONNX Runtime Web (WebAssembly) in a Web Worker. Model sources, checksums and
licenses: [`models/README.md`](models/README.md).

```bash
npm install
npm test        # 75 tests: rules + full pipeline on the real bundled models (Node)
```

Built by **Parag Sawant** ([@paragpsawant](https://github.com/paragpsawant)). Apache-2.0.

<!-- cleanroom-ai:family:start -->
## Part of cleanroom-ai

**Clean it before you share it.** Six free privacy tools built on one shared engine. Every model runs
in your browser, so nothing you open is ever uploaded.

| | Tool | Cleans | Demo | Code |
|---|---|---|---|---|
| 🕶️ | **Screenshot Redactor** | API keys, passwords, emails, card numbers, names, faces & QR codes in screenshots | [▶ Try it](https://huggingface.co/spaces/cleanroom-ai/pii-privacy-redaction) | [GitHub](https://github.com/cleanroom-ai/screenshot-redactor) |
| 🧽 | **Log Scrubber** | tokens, cookies, passwords & PII in logs, `.env`, JSON and HAR files | [▶ Try it](https://huggingface.co/spaces/cleanroom-ai/log-secret-scrubber) | [GitHub](https://github.com/cleanroom-ai/log-secret-scrubber) |
| 📄 | **PDF Redactor** | PII & secrets in PDFs, flattened and verified so no text survives | [▶ Try it](https://huggingface.co/spaces/cleanroom-ai/pdf-redaction) | [GitHub](https://github.com/cleanroom-ai/pdf-redaction) |
| 🔊 | **Audio Redactor** | bleeps names, phone & card numbers and secrets in recordings | [▶ Try it](https://huggingface.co/spaces/cleanroom-ai/audio-pii-redaction) | [GitHub](https://github.com/cleanroom-ai/audio-pii-redaction) |
| 📷 | **Photo Share-Safe** | GPS & hidden EXIF metadata; blurs faces and license plates | [▶ Try it](https://huggingface.co/spaces/cleanroom-ai/photo-exif-privacy) | [GitHub](https://github.com/cleanroom-ai/photo-exif-privacy) |
| 🎬 | **Video Redactor** | keys, names, emails & faces tracked through screen recordings | [▶ Try it](https://huggingface.co/spaces/cleanroom-ai/video-redaction) | [GitHub](https://github.com/cleanroom-ai/video-redaction) |
| ⚙️ | **@cleanroom-ai/core** 📍 *you are here* | the shared on-device engine: OCR, secret/PII rules, NER, face detection | — | [GitHub](https://github.com/cleanroom-ai/cleanroom-core) |

All tools: [Hugging Face](https://huggingface.co/cleanroom-ai) · [GitHub](https://github.com/cleanroom-ai)
<!-- cleanroom-ai:family:end -->
