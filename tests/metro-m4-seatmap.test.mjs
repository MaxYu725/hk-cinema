import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, css, runtime, sw] = await Promise.all([
  read("app/index.html"),
  read("app/metro-m4-seatmap.css"),
  read("app/metro-runtime.js"),
  read("app/sw.js")
]);

test("Metro loads the seat-map layer after comparison Smart Picks", () => {
  const picks = index.indexOf("metro-m3-smart-picks.css?v=m3-picks-2");
  const seatmap = index.indexOf("metro-m4-seatmap.css?v=m4-seatmap-1");
  assert.ok(picks >= 0 && seatmap > picks);
  assert.match(index, /metro-runtime\.js\?v=m4-1/);
});

test("Metro seat-map shell matches the square black reference structure", () => {
  assert.match(css, /html\[data-skin="metro"\] \.shared-seatmap-sheet[\s\S]*width:\s*min\(100%,\s*500px\)/);
  assert.match(css, /shared-seatmap-sheet[\s\S]*background:\s*var\(--metro-bg\)/);
  assert.match(css, /shared-seatmap-close[\s\S]*border-radius:\s*0/);
  assert.match(css, /shared-seatmap-summary[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /shared-seatmap-layout[\s\S]*border:\s*1px solid var\(--metro-border\)/);
  assert.match(css, /shared-seatmap-screen::before[\s\S]*border-top:\s*3px solid var\(--metro-accent\)/);
});

test("Metro seat states and booking action use the supplied visual hierarchy", () => {
  assert.match(css, /shared-seat\.status-available[\s\S]*background:\s*#0f7a42/);
  assert.match(css, /shared-seat\.status-blocked[\s\S]*background:\s*#59282d/);
  assert.match(css, /shared-seat\.type-wheelchair[\s\S]*background:\s*var\(--metro-accent\)/);
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

test("M4 rotates the controlled shell cache without automatic install activation", () => {
  assert.match(sw, /CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}m4-1`/);
  const installBlock = sw.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.ok(installBlock);
  assert.doesNotMatch(installBlock, /skipWaiting\(\)/);
  assert.match(sw, /event\.data\?\.type\s*===\s*"SKIP_WAITING"/);
});
