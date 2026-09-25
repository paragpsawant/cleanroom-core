// Real-browser test harness shared by cleanroom-ai apps. Opens the app, records every network
// request, and exposes helpers; `finish()` fails if the page uploaded anything or contacted a
// host other than the app itself (or Hugging Face's own CDN, which serves a Space's large files).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

export async function openApp(base, { shotsDir, viewport = { width: 1440, height: 1000 } } = {}) {
  // E2E_BROWSER: "msedge" / "chrome" (installed browser) or "chromium" (Playwright's own build, CI).
  const channel = process.env.E2E_BROWSER || "msedge";
  const browser = await chromium.launch({
    ...(channel === "chromium" ? {} : { channel }), headless: !process.env.HEADED,
  });
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  const baseHost = new URL(base).host;
  const allowedHost = (h) => h === baseHost || /(^|\.)hf\.co$/.test(h);
  const external = [];
  const uploads = [];
  const problems = [];
  const onRequest = (r) => {
    const u = new URL(r.url());
    if (["blob:", "data:"].includes(u.protocol)) return;
    if (r.method() !== "GET" || r.postData()) uploads.push(`${r.method()} ${r.url()}`);
    if (!allowedHost(u.host)) external.push(r.url());
  };
  context.on("request", onRequest); // includes worker requests
  page.on("console", (m) => ["error"].includes(m.type()) && problems.push(`${m.type()}: ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });

  await page.goto(base);
  const t0 = Date.now();
  return {
    browser, context, page, external, uploads, problems,
    shot: (name) => shotsDir && page.screenshot({ path: join(shotsDir, `${name}.png`), fullPage: true }),
    elapsed: () => ((Date.now() - t0) / 1000).toFixed(1),
    async assertLogo() {
      const ok = await page.locator("img.logo").evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false);
      assert.ok(ok, "header logo should load");
    },
    async finish() {
      console.log(`external requests: ${external.length ? external.join(", ") : "none"}`);
      console.log(`uploads / non-GET requests: ${uploads.length ? uploads.join(", ") : "none"}`);
      if (problems.length) console.log("page errors:\n  " + problems.slice(0, 20).join("\n  "));
      assert.deepEqual(external, [], "the page must not contact other hosts");
      assert.deepEqual(uploads, [], "the page must never send data anywhere");
      assert.deepEqual(problems.filter((p) => p.startsWith("pageerror")), [], "no uncaught page errors");
      await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
      console.log("\nE2E OK");
    },
  };
}
