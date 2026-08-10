import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const app = path.join(root, "app");

test("Service Worker waits for explicit update acceptance", () => {
  const sw = fs.readFileSync(path.join(app, "sw.js"), "utf8");
  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";

  assert.match(sw, /CACHE_PREFIX}9c3-1/);
  assert.doesNotMatch(installBlock, /skipWaiting\(/);
  assert.match(sw, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
});

test("PWA runtime exposes controlled update and connection state", () => {
  const runtime = fs.readFileSync(path.join(app, "pwa-runtime.js"), "utf8");

  assert.match(runtime, /version:\s*"9c3-1"/);
  assert.match(runtime, /registration\.waiting/);
  assert.match(runtime, /"SKIP_WAITING"/);
  assert.match(runtime, /controllerchange/);
  assert.match(runtime, /目前離線/);
  assert.match(runtime, /已恢復連線/);
  assert.match(runtime, /updateReady:\s*state\.updateReady/);
});

test("standalone polish protects safe areas and comparison controls", () => {
  const css = fs.readFileSync(path.join(app, "phase9c3-pwa-final-polish.css"), "utf8");

  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-right/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /safe-area-inset-left/);
  assert.match(css, /@media \(display-mode: standalone\)/);
  assert.match(css, /\.provider-compare-sheet/);
  assert.match(css, /\.provider-compare-close/);
  assert.match(css, /\.pwa-notice/);
});

test("document loads Phase 9C3 presentation and runtime versions", () => {
  const html = fs.readFileSync(path.join(app, "index.html"), "utf8");
  assert.match(html, /phase9c3-pwa-final-polish\.css\?v=9c3-1/);
  assert.match(html, /pwa-runtime\.js\?v=9c3-1/);
});
