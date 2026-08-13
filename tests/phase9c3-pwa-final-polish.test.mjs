import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertAsset } from "./index-assets.mjs";

const root = process.cwd();
const app = path.join(root, "app");

test("Service Worker waits for explicit update acceptance", () => {
  const sw = fs.readFileSync(path.join(app, "sw.js"), "utf8");
  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";

  assert.match(sw, /CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}[a-z0-9-]+`/i);
  assert.doesNotMatch(installBlock, /skipWaiting\(/);
  assert.match(sw, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
});

test("PWA runtime exposes controlled update and connection state without a redundant eager update", () => {
  const runtime = fs.readFileSync(path.join(app, "pwa-runtime.js"), "utf8");

  assert.match(runtime, /version:\s*["'][^"']+["']/);
  assert.match(runtime, /registration\.waiting/);
  assert.match(runtime, /"SKIP_WAITING"/);
  assert.match(runtime, /controllerchange/);
  assert.match(runtime, /目前離線/);
  assert.match(runtime, /已恢復連線/);
  assert.match(runtime, /updateReady:\s*state\.updateReady/);
  assert.match(runtime, /noticeKind:\s*state\.noticeKind/);
  assert.doesNotMatch(runtime, /registration\.update\(\)/);
});

test("installed standalone PWA can recover immersive fullscreen on the first user gesture", () => {
  const runtime = fs.readFileSync(path.join(app, "pwa-runtime.js"), "utf8");

  assert.match(runtime, /matchesDisplayMode\("fullscreen"\)/);
  assert.match(runtime, /mode !== "standalone" && mode !== "minimal-ui"/);
  assert.match(runtime, /requestFullscreen\(\{ navigationUI: "hide" \}\)/);
  assert.match(runtime, /document\.addEventListener\("click", handleImmersiveGesture, true\)/);
  assert.match(runtime, /event\.isTrusted/);
  assert.match(runtime, /immersiveAttempted:\s*state\.immersiveAttempted/);
  assert.match(runtime, /immersiveActive:\s*state\.immersiveActive/);
  assert.match(runtime, /immersiveError:\s*state\.immersiveError/);
});

test("offline notice has priority over asynchronous update-ready events", () => {
  const runtime = fs.readFileSync(path.join(app, "pwa-runtime.js"), "utf8");

  assert.match(runtime, /state\.noticeKind === "offline" && kind !== "offline"/);
  assert.match(runtime, /state\.noticeKind === "offline"\) state\.noticeKind = null/);
  assert.match(runtime, /!navigator\.onLine \|\| state\.noticeKind === "offline"/);
});

test("installed-mode polish protects safe areas and comparison controls", () => {
  const css = fs.readFileSync(path.join(app, "phase9c3-pwa-final-polish.css"), "utf8");

  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-right/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /safe-area-inset-left/);
  assert.match(css, /@media \(display-mode: standalone\), \(display-mode: fullscreen\)/);
  assert.match(css, /\.provider-compare-sheet/);
  assert.match(css, /\.provider-compare-close/);
  assert.match(css, /\.pwa-notice/);
});

test("document loads Phase 9C3 presentation and immersive runtime with cachebusters", () => {
  const html = fs.readFileSync(path.join(app, "index.html"), "utf8");
  assertAsset(html, "phase9c3-pwa-final-polish.css");
  assertAsset(html, "pwa-runtime.js");
});
