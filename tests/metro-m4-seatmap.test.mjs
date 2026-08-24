import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assetPosition, assertAsset } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, css, runtime, sw] = await Promise.all([
  read("app/index.html"),
  read("app/metro-m4-seat-view.css"),
  read("app/metro-runtime.js"),
  read("app/sw.js")
]);

test("Metro loads the consolidated seat-map layer after comparison Smart Picks", () => {
  assertAsset(index, "metro-m3-smart-picks.css");
  assertAsset(index, "metro-m4-seat-view.css");
  assertAsset(index, "metro-runtime.js");
  assert.ok(assetPosition(index, "metro-m4-seat-view.css") > assetPosition(index, "metro-m3-smart-picks.css"));
  assert.doesNotMatch(index, /metro-m4b-seat-scroll-fix\.css/);
});

test("Metro seat-map shell matches the square black reference structure", () => {
  assert.match(css, /html\[data-skin="metro"\] \.shared-seatmap-sheet[\s\S]*width:\s*min\(100%,\s*500px\)/);
  assert.match(css, /shared-seatmap-sheet[\s\S]*background:\s*var\(--metro-bg\)/);
  assert.match(css, /shared-seatmap-close[\s\S]*position:\s*fixed/);
  assert.match(css, /shared-seatmap-close[\s\S]*width:\s*44px[\s\S]*height:\s*44px/);
  assert.match(css, /shared-seatmap-close[\s\S]*border-radius:\s*0/);
  assert.match(css, /shared-seatmap-summary[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /shared-seatmap-layout[\s\S]*border:\s*1px solid var\(--metro-border\)/);
  assert.match(css, /shared-seatmap-screen::before[\s\S]*border-top:\s*3px solid var\(--metro-accent\)/);
});

test("Metro keeps wide maps reachable inside the capped seat-map shell", () => {
  assert.match(css, /shared-seatmap-scroll\s*\{[\s\S]*overflow-x:\s*auto\s*!important/);
  assert.match(css, /shared-seatmap-scroll\s*\{[\s\S]*touch-action:\s*pan-x\s+pan-y/);
});

test("Metro seat states and booking action use the supplied visual hierarchy", () => {
  assert.match(css, /shared-seat\.status-available[\s\S]*background:\s*#0f7a42/);
  assert.match(css, /shared-seat\.status-blocked[\s\S]*background:\s*#59282d/);
  const wheelchairSeatRule = css.match(/html\[data-skin="metro"\] \.shared-seat\.type-wheelchair\s*\{[^}]*\}/)?.[0] || "";
  assert.ok(wheelchairSeatRule);
  assert.match(wheelchairSeatRule, /border-color:\s*var\(--metro-accent\)/);
  assert.doesNotMatch(wheelchairSeatRule, /background\s*:/);
  assert.match(css, /shared-seatmap-legend i\.type-wheelchair[\s\S]*background:\s*var\(--metro-accent\)/);
  assert.match(css, /shared-seatmap-booking[\s\S]*width:\s*100%/);
  assert.match(css, /data-seatmap-provider="mcl"[\s\S]*shared-seatmap-booking[\s\S]*background:\s*#0f8a48/);
});

test("Metro runtime decorates the shared seat-map without changing provider data logic", () => {
  assert.match(runtime, /function syncSeatMapShell\(\)/);
  assert.match(runtime, /MOVIEMETRO \/ 座位圖/);
  assert.match(runtime, /hkcinema:seatmap-opening/);
  assert.match(runtime, /#sharedSeatMapOverlay/);
  assert.doesNotMatch(runtime, /API_BASE|fetch\(/);
});

test("M4 seat-map remains compatible with the current controlled shell cache", () => {
  assert.match(sw, /CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}c5-1`/);
  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.ok(installBlock);
  assert.doesNotMatch(installBlock, /skipWaiting\(\)/);
  assert.match(sw, /event\.data\?\.type\s*===\s*"SKIP_WAITING"/);
});
