// Render an app's icon set from assets/icon.svg + assets/favicon.svg:
//   icon-512.png, icon-192.png, apple-touch-icon.png, social-preview.png (1280x640), ../favicon.ico
//   node node_modules/@cleanroom-ai/core/scripts/render-icons.mjs <appDir> "<Title>" "<tagline line 1>|<line 2>"
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const appDir = resolve(process.argv[2] || ".");
const title = process.argv[3] || "cleanroom-ai";
const tagline = (process.argv[4] || "").split("|");
const assets = join(appDir, "assets");
const data = (f) => "data:image/svg+xml;base64," + readFileSync(join(assets, f)).toString("base64");

const channel = process.env.E2E_BROWSER || "msedge";
const browser = await chromium.launch(channel === "chromium" ? {} : { channel });
const page = await browser.newPage();

async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent"><img src="${data(svg)}" width="${size}" height="${size}" style="display:block"></body>`);
  return page.locator("img").screenshot({ omitBackground: true });
}

writeFileSync(join(assets, "icon-512.png"), await png("icon.svg", 512));
writeFileSync(join(assets, "icon-192.png"), await png("icon.svg", 192));
writeFileSync(join(assets, "apple-touch-icon.png"), await png("icon.svg", 180));
const favs = [];
for (const s of [16, 32, 48]) favs.push({ size: s, png: await png("favicon.svg", s) });
writeFileSync(join(appDir, "favicon.ico"), ico(favs));

const [t1 = "", t2 = ""] = tagline;
const words = title.split(" ");
const titleHtml = words.length > 1 ? `${words.slice(0, -1).join(" ")}<br>${words.at(-1)}` : title;
await page.setViewportSize({ width: 1280, height: 640 });
await page.setContent(`<body style="margin:0"><div id="c" style="width:1280px;height:640px;box-sizing:border-box;padding:80px 90px;
  background:radial-gradient(1200px 600px at 85% 20%,#3730a3 0%,#1e1b4b 45%,#0b1020 100%);color:#f8fafc;
  font-family:'Segoe UI',system-ui,sans-serif;display:flex;align-items:center;gap:64px;position:relative">
  <img src="${data("icon.svg")}" width="300" height="300" style="flex:none;filter:drop-shadow(0 20px 40px #0008)">
  <div>
    <div style="font-size:72px;font-weight:700;letter-spacing:-1.5px;line-height:1.05">${titleHtml}</div>
    <div style="font-size:30px;color:#c7d2fe;margin-top:22px;line-height:1.35">${t1}<br>${t2}</div>
    <div style="margin-top:34px;display:flex;gap:12px;flex-wrap:wrap;font-size:21px">
      <span style="padding:8px 16px;border-radius:999px;background:#ffffff14;border:1px solid #ffffff2e">🔒 Runs 100% in your browser</span>
      <span style="padding:8px 16px;border-radius:999px;background:#ffffff14;border:1px solid #ffffff2e">Nothing uploaded</span>
      <span style="padding:8px 16px;border-radius:999px;background:#ffffff14;border:1px solid #ffffff2e">Open source</span>
    </div>
  </div>
  <div style="position:absolute;right:48px;bottom:36px;font-size:20px;color:#a5b4fc;letter-spacing:.04em">cleanroom-ai</div>
  </div></body>`);
writeFileSync(join(assets, "social-preview.png"), await page.locator("#c").screenshot());
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 3000))]);
console.log(`icons rendered in ${assets}`);
process.exit(0);

/** Minimal ICO container with embedded PNG images (supported by every modern browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}
