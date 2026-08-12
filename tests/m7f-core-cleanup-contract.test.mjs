import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sw = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8");
const sharedControls = readFileSync(new URL("../app/shared-final-controls.js", import.meta.url), "utf8");

test("M7F keeps Service Worker install precache bounded to an explicit core shell", () => {
  assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}m7f-1`/);
  assert.match(sw, /const CORE_SHELL_FILES = new Set\(\[/);
  assert.match(sw, /if \(CORE_SHELL_FILES\.has\(relativeScopePath\(url\)\)\) assets\.add\(url\.href\)/);
  assert.match(sw, /for \(const url of assets\)/);
  assert.doesNotMatch(sw, /Promise\.allSettled\(assets\.map/);
});

test("M7F preserves live provider bypass and runtime static fill", () => {
  assert.match(sw, /url\.origin !== self\.location\.origin \|\| !url\.pathname\.startsWith\(SCOPE_URL\.pathname\)/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
  assert.match(sw, /if \(isSameOriginStatic\(request\)\) event\.respondWith\(staleWhileRevalidate\(request\)\)/);
});

test("M7F coalesces repeated shared final control sync work to one animation frame", () => {
  assert.match(sharedControls, /let syncQueued = false/);
  assert.match(sharedControls, /function scheduleSync\(\) \{\s+if \(syncQueued\) return;\s+syncQueued = true;/);
  assert.match(sharedControls, /requestAnimationFrame\(\(\) => \{\s+syncQueued = false;\s+syncTabCounts\(\);\s+syncComparison\(\);/);
  assert.match(sharedControls, /observer\.observe\(document\.body, \{ childList: true, subtree: true, characterData: true \}\)/);
});
