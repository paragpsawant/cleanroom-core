import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCoreVersion } from "../scripts/vendor.mjs";

const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const app = (spec) => { const d = mkdtempSync(join(tmpdir(), "cr-app-")); writeFileSync(join(d, "package.json"), JSON.stringify({ dependencies: { "@cleanroom-ai/core": spec } })); return d; };

test("vendor refuses to build when the installed core is not the version package.json asks for", () => {
  assert.doesNotThrow(() => assertCoreVersion(app(`github:cleanroom-ai/cleanroom-core#v${own}`)));
  assert.throws(() => assertCoreVersion(app("github:cleanroom-ai/cleanroom-core#v0.0.1")), /asks for v0\.0\.1/);
  assert.doesNotThrow(() => assertCoreVersion(app("file:../core")));
});
