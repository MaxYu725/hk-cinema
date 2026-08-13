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

test("M7G keeps Service Worker generations isolated", () => {
  assert.match(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}[a-z0-9-]+`/i);
  assert.doesNotMatch(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}m7f-1`/);
  assert.match(sw, /key !== CACHE_NAME/);
});

test("M7G preserves controlled activation and keeps live provider data outside the shell cache", () => {
  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.ok(installBlock);
  assert.doesNotMatch(installBlock, /skipWaiting\(\)/);
  assert.match(sw, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
});
