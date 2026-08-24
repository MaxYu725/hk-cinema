import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, manifestText, runtime, worker] = await Promise.all([
  readFile(new URL("../app/index.html", import.meta.url), "utf8"),
  readFile(new URL("../app/manifest.json", import.meta.url), "utf8"),
  readFile(new URL("../app/pwa-runtime.js", import.meta.url), "utf8"),
  readFile(new URL("../app/sw.js", import.meta.url), "utf8")
]);
const manifest = JSON.parse(manifestText);

test("Phase 9C1 wires an installable fullscreen PWA shell with standalone fallback", () => {
  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "fullscreen");
  assert.ok(manifest.display_override.includes("standalone"));
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.json\?v=[a-z0-9-]+">/i);
  assert.match(html, /pwa-runtime\.js\?v=[a-z0-9-]+/i);
  assert.match(runtime, /navigator\.serviceWorker\.register\("\.\/sw\.js"/);
  assert.match(runtime, /updateViaCache:\s*"none"/);
});

test("Phase 9C1 service worker only caches same-origin static shell assets", () => {
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /networkFirstNavigation/);
  assert.match(worker, /staleWhileRevalidate/);
  assert.match(worker, /SHELL_MANIFEST\.assets/);
  assert.match(worker, /SHELL_ASSET_URLS\.has\(url\.href\)/);
  assert.doesNotMatch(worker, /hk-cinema-api\.max-yu-jp\.workers\.dev/);
});

test("Phase 9C1 documents live cinema data as outside the service-worker cache path", () => {
  assert.match(worker, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
  assert.match(worker, /if \(url\.origin !== self\.location\.origin \|\| !url\.pathname\.startsWith\(SCOPE_URL\.pathname\)\)/);
});
