import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pwa = readFileSync(new URL("../app/pwa-runtime.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8");

test("M7G update detection covers an already-installing worker without a redundant eager update", () => {
  assert.match(pwa, /const watchedWorkers = new WeakSet\(\)/);
  assert.match(pwa, /watchInstalling\(registration\);\s+if \(registration\.waiting && navigator\.serviceWorker\.controller\) showUpdate\(registration\.waiting\)/);
  assert.doesNotMatch(pwa, /registration\.update\(\)/);
  assert.match(pwa, /queueMicrotask\(register\)/);
  assert.match(pwa, /version: "9c3-2"/);
});

test("M7G uses a distinct cache generation so a waiting worker cannot mutate the active M7F shell", () => {
  assert.match(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}m7g-1`/);
  assert.doesNotMatch(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}m7f-1`/);
  assert.match(sw, /key !== CACHE_NAME/);
});

test("M7G cold start falls back to the cached shell within a bounded navigation budget", () => {
  assert.match(sw, /const NAVIGATION_NETWORK_BUDGET_MS = 1800/);
  assert.match(sw, /Promise\.race\(\[network, navigationTimeout\(\)\]\)/);
  assert.match(sw, /cache\.match\(request, \{ ignoreSearch: true \}\)/);
  assert.match(sw, /cache\.match\(INDEX_URL\)/);
  assert.match(sw, /cache\.match\(ROOT_URL\)/);
});

test("M7G keeps the install set bounded but includes the minimum home/PWA runtime", () => {
  for (const filename of [
    "data-health.js",
    "app.js",
    "pwa-runtime.js",
    "shared-final-controls.js",
    "metro-runtime.js"
  ]) {
    assert.match(sw, new RegExp(`"${filename.replaceAll(".", "\\.")}"`));
  }
  assert.doesNotMatch(sw, /Promise\.allSettled\(assets\.map/);
});
