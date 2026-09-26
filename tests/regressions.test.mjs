import assert from "node:assert/strict";
import { test } from "node:test";
import { performance } from "node:perf_hooks";

import { makeLoaders } from "../src/engines.js";
import { findSpans, resolveOverlaps, mergeSpans, SECRET_LABEL_ONLY } from "../src/rules.js";
import { groupRows, labelledValues, scan } from "../src/pipeline.js";

const j = (...parts) => parts.join("");
const spans = (text, ...args) => findSpans(text, ...args).map((s) => ({ ...s, text: text.slice(s.start, s.end) }));
const has = (text, label, value = null) => spans(text).some((s) => s.label === label && (value == null || s.text === value));
const secret = (prefix, n = 36) => prefix + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789".slice(0, n);

test("CORE-001: PEM private key spans full block and unterminated body", () => {
  const begin = j("-----BEGIN ", "RSA PRIVATE KEY-----");
  const end = j("-----END ", "RSA PRIVATE KEY-----");
  const body = "MIIEpAIBAAKCAQEA" + "A".repeat(48);
  const full = `${begin}\n${body}\n${end}`;
  assert.equal(spans(full)[0].text, full);
  const partial = `${begin}\n${body}\nnot part`;
  assert.equal(spans(partial)[0].text, `${begin}\n${body}`);
});

test("CORE-002: vendor tokens and Basic auth are detected", () => {
  const cases = [
    [j("gl", "pat-") + "A".repeat(36), "GITLAB_TOKEN"],
    [j("np", "m_") + "A".repeat(36), "NPM_TOKEN"],
    [j("py", "pi-") + "AgEIcHlwaS5vcmcC" + "A".repeat(36), "PYPI_TOKEN"],
    [j("S", "G.") + "A".repeat(22) + "." + "B".repeat(32), "SENDGRID_TOKEN"],
    ["Authorization: Basic " + btoa("user:pass"), "BASIC_AUTH"],
    [j("https://hooks.slack.com/services/", "T00000000/B00000000/", "A".repeat(32)), "SLACK_WEBHOOK"],
  ];
  for (const [text, label] of cases) assert.ok(has(text, label), `${label}: ${JSON.stringify(spans(text))}`);
});

test("CORE-003: quoted, XML and escaped JSON password values are fully detected", () => {
  assert.ok(has('password: "correct horse battery staple"', "PASSWORD_OR_SECRET", "correct horse battery staple"));
  assert.ok(has("<password>Tr0ub4dor&3</password>", "PASSWORD_OR_SECRET", "Tr0ub4dor&3"));
  assert.ok(has(j('{\\"password\\":\\"', "Tr0ub4dor&3", '\\"}'), "PASSWORD_OR_SECRET", "Tr0ub4dor&3"));
});

test("CORE-004 and CORE-005: contact, financial and government variants", () => {
  for (const text of ["用户@例子.公司", "\"john.doe\"@example.com", "4155550132", "020 7946 0958", "98765 43210", "+44\u00A020\u00A07946\u00A00958"]) {
    assert.ok(spans(text, ["contact"]).length, text);
  }
  assert.ok(has("gb82 west 1234 5698 7654 32", "IBAN"));
  assert.ok(has("4111\u00A01111\u00A01111\u00A01111", "CREDIT_CARD"));
  assert.ok(has("219 09 9999", "US_SSN"));
  assert.ok(has("219099999", "US_SSN"));
  assert.deepEqual(spans("Order #123456789 shipped"), []);
});

test("CORE-006 and CORE-007: network variants and precision controls", () => {
  for (const text of ["001A.2B3C.4D5E", "fe80::1%eth0", "::ffff:192.0.2.128"]) {
    assert.ok(spans(text, ["network"]).some((s) => s.text === text), text);
  }
  for (const text of ["Version 1.2.3.4", "v1.2.3.4", "release 1.2.3.4", "Base64 blob " + "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=".repeat(2)]) {
    assert.deepEqual(spans(text), []);
  }
});

test("CORE-008 and PERF-001: adversarial inputs and overlap sweeps stay fast", () => {
  for (const [name, text] of [["email", "a.".repeat(50000) + "@"], ["phone", "+1 111 111 1111 ".repeat(6250)]]) {
    const t0 = performance.now();
    findSpans(text);
    assert.ok(performance.now() - t0 < 1500, name);
  }
  const mk = (n, off = 0) => Array.from({ length: n }, (_, i) => ({ start: i * 3 + off, end: i * 3 + off + 1, label: "X", category: "secrets", score: 1, source: "test", prio: 1 }));
  let t0 = performance.now();
  assert.equal(resolveOverlaps(mk(40000)).length, 40000);
  assert.ok(performance.now() - t0 < 1000);
  t0 = performance.now();
  assert.equal(mergeSpans(mk(40000), mk(40000, 1)).length, 80000);
  assert.ok(performance.now() - t0 < 1000);
});

test("CORE-009: OCR label-below, split fixed-format secrets and multi-row PEM are covered", async () => {
  const L = (text, x0, x1, y0 = 10, y1 = 30) => ({ text, box: { x0, y0, x1, y1 }, bounds: [] });
  assert.deepEqual(labelledValues([L("password:", 10, 110, 10, 30), L("secret-value-123", 10, 180, 42, 62)], SECRET_LABEL_ONLY).map((x) => x.line.text), ["secret-value-123"]);
  const aws = j("AK", "IA", "IOSFODNN7EX", "AMPLE");
  const row = groupRows([L(aws.slice(0, 15), 10, 170), L(aws.slice(15), 175, 225)])[0];
  assert.ok(has(row.text, "AWS_ACCESS_KEY"));
  const begin = j("-----BEGIN ", "OPENSSH PRIVATE KEY-----");
  const end = j("-----END ", "OPENSSH PRIVATE KEY-----");
  const lines = [L(begin, 0, 250, 0, 20), L("b3BlbnNzaC1rZXktdjEAAAAA", 0, 250, 24, 44), L(end, 0, 250, 48, 68)];
  const res = await scan({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, { ocr: { run: async () => lines } }, { categories: ["secrets"], useNer: false });
  const det = res.detections.find((d) => d.label === "PRIVATE_KEY" && d.text.includes("\n"));
  assert.ok(det && det.box.y0 <= 0 && det.box.y1 >= 68, JSON.stringify(res.detections));
});

test("CORE-010 and CORE-011: robust inputs and longest custom term wins", () => {
  assert.deepEqual(findSpans(null), []);
  assert.deepEqual(findSpans(undefined), []);
  assert.deepEqual(findSpans(12345), []);
  assert.deepEqual(findSpans("abc", null, null), []);
  assert.equal(spans("needle-999", null, Array.from({ length: 1000 }, (_, i) => `needle-${i}`))[0].text, "needle-999");
});

test("PERF-005: model fetches use Cache Storage by original URL", async () => {
  const oldFetch = globalThis.fetch, oldCaches = globalThis.caches;
  const store = new Map();
  let fetches = 0;
  globalThis.caches = { open: async () => ({
    match: async (req) => store.get(req.url),
    put: async (req, res) => store.set(req.url, res),
  }) };
  globalThis.fetch = async () => {
    fetches++;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-length": "3" } });
  };
  try {
    const { loadBytes } = makeLoaders(new URL("https://example.test/app/"));
    assert.deepEqual([...(await loadBytes("model.bin"))], [1, 2, 3]);
    assert.deepEqual([...(await loadBytes("model.bin"))], [1, 2, 3]);
    assert.equal(fetches, 1);
    assert.ok(store.has("https://example.test/app/models/model.bin"));
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.caches = oldCaches;
  }
});
