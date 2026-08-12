import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pwa = readFileSync(new URL("../app/pwa-runtime.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8");

test("M7G update detection covers an already-installing worker without a redundant eager update", () => {
  assert.match(pwa, /const watchedWorkers = new WeakSet\(\)/);
  assert.match(pwa, /watchInstalling\(registration\);\s+if \(registration\.waiting && navigator\.serviceWorker\.controller\) showUpdate\(registration\.waiting\)/);
  assert.doesNotMatch(pwa, /registration\.update\(\)/);
  assert.match(pwa, /if \(document\.readyState === "complete"\) register\(\);\s+else window\.addEventListener\("load", register, \{ once: true \}\)/);
  assert.doesNotMatch(pwa, /queueMicrotask\(register\)/);
  assert.match(pwa, /version: "9c3-2"/);
});

test("M7G uses a fresh cache generation so a waiting worker cannot mutate the active M7F shell", () => {
  assert.match(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}m7g-r1`/);
  assert.doesNotMatch(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}m7f-1`/);
  assert.match(sw, /key !== CACHE_NAME/);
});

test("M7G rolls Service Worker installation back to the M7D complete-shell model", () => {
  assert.match(sw, /async function discoverShellAssets\(\)/);
  assert.match(sw, /new Set\(\[ROOT_URL, INDEX_URL, new URL\("\.\/manifest\.json", self\.registration\.scope\)\.href\]\)/);
  assert.match(sw, /Promise\.allSettled\(assets\.map\(async url =>/);
  assert.doesNotMatch(sw, /CORE_SHELL_FILES/);
  assert.doesNotMatch(sw, /NAVIGATION_NETWORK_BUDGET_MS/);
});

test("M7G preserves controlled activation and keeps live provider data outside the shell cache", () => {
  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.ok(installBlock);
  assert.doesNotMatch(installBlock, /skipWaiting\(\)/);
  assert.match(sw, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
});
