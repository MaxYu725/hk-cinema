import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const RETIRED = [
  "app/provider-compare-v3.js",
  "app/provider-compare-insights-v3.js",
  "app/provider-compare-preferences.js",
  "app/provider-compare-recommendations-v3.js"
];

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Phase 8E4 removes superseded comparison runtimes from the repository", async () => {
  for (const path of RETIRED) {
    await assert.rejects(access(new URL(path, ROOT)));
  }
});

test("production and syntax checks point at the current comparison stack", async () => {
  const [index, pkg] = await Promise.all([
    read("app/index.html"),
    read("package.json")
  ]);

  for (const current of [
    "provider-compare-v4.js?v=m6c-3",
    "provider-compare-insights-v4.js?v=8c1",
    "provider-compare-preferences-v2.js?v=8c1",
    "provider-compare-recommendations-v4.js?v=10r3b-1"
  ]) {
    assert.match(index, new RegExp(current.replaceAll(".", "\\.").replace("?", "\\?")));
  }

  for (const retired of RETIRED.map(path => path.replace("app/", ""))) {
    assert.doesNotMatch(index, new RegExp(`<script[^>]+${retired.replaceAll(".", "\\.")}`));
    assert.doesNotMatch(pkg, new RegExp(retired.replaceAll(".", "\\.")));
  }

  assert.match(index, /provider-compare-main-cache-v3\.js\?v=6d1/);
  assert.match(index, /provider-compare-resilience-v3\.js\?v=10r3b-1/);
});
