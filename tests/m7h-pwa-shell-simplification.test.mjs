import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sw = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8");

test("M7H caches only a bounded startup shell instead of re-fetching every indexed asset", () => {
  assert.match(sw, /const CACHE_NAME = `\$\{CACHE_PREFIX\}m7h-1`/);
  assert.match(sw, /const CORE_SHELL_FILES = new Set\(\[/);
  for (const filename of ["manifest.json", "style.css", "pwa-runtime.js", "metro-runtime.js", "app.js"]) {
    assert.match(sw, new RegExp(`"${filename.replaceAll(".", "\\.")}"`));
  }
  assert.match(sw, /if \(CORE_SHELL_FILES\.has\(relativeScopePath\(url\)\)\) assets\.add\(url\.href\)/);
  assert.match(sw, /for \(const url of assets\)/);
  assert.doesNotMatch(sw, /Promise\.allSettled\(assets\.map/);
});

test("M7H keeps navigation simple and lets runtime browsing fill non-core static assets", () => {
  assert.doesNotMatch(sw, /NAVIGATION_NETWORK_BUDGET_MS/);
  assert.match(sw, /if \(isSameOriginStatic\(request\)\) event\.respondWith\(staleWhileRevalidate\(request\)\)/);
  assert.match(sw, /cache\.match\(INDEX_URL\)/);
  assert.match(sw, /cache\.match\(ROOT_URL\)/);
});
