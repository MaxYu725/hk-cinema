import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { assertAsset } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, manifestText, css, runtime, worker, metro] = await Promise.all([
  read("app/index.html"),
  read("app/manifest.json"),
  read("app/phase10r3a-mobile-shell-date-strip.css"),
  read("app/phase10r3a-mobile-shell-date-strip.js"),
  read("app/sw.js"),
  read("app/metro-runtime.js")
]);
const manifest = JSON.parse(manifestText);

test("Phase 10R3A keeps fullscreen PWA semantics under the current controlled shell cache", () => {
  assert.equal(manifest.display, "fullscreen");
  assert.deepEqual(manifest.display_override.slice(0, 2), ["fullscreen", "standalone"]);
  assertAsset(index, "manifest.json");
  assert.match(worker, /CACHE_NAME = `\$\{CACHE_PREFIX\}m5-1`/);
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  const installBlock = worker.match(/self\.addEventListener\("install"[\s\S]*?\n\}\);/)?.[0] || "";
  assert.ok(installBlock);
  assert.doesNotMatch(installBlock, /skipWaiting\(\)/);
});

test("Phase 10R3A keeps Classic home placement while Metro delegates home Data Health ownership", () => {
  assertAsset(index, "phase10r3a-mobile-shell-date-strip.css");
  assertAsset(index, "phase10r3a-mobile-shell-date-strip.js");
  assert.match(css, /\.topbar\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /\.home-library-tools\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+150px/s);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*\.home-library-tools,\s*[\s\S]*\.home-library-primary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+126px/s);
  assert.match(css, /#dataHealth\[data-phase10r3a-home-health="true"\][\s\S]*grid-column:\s*2[\s\S]*grid-row:\s*2[\s\S]*justify-self:\s*center/s);
  assert.match(runtime, /function placeHomeDataHealth\(\)[\s\S]*dataset\.skin === "metro"\) return false/);
  assert.match(runtime, /filters\.insertAdjacentElement\("afterend", panel\)/);
  assert.doesNotMatch(runtime, /metroHomeHealth|filters\.appendChild\(panel\)/);
  assert.match(metro, /function moveDataHealthIntoControls\(\)[\s\S]*controls\.appendChild\(panel\)/);
});

test("Phase 10R3A removes obsolete date-rail gutters and recenters the active selected date after DOM replacement", () => {
  assert.match(css, /provider-compare-date-rail\.phase8b-date-section[\s\S]*padding:\s*8px 10px\s*!important/);
  assert.match(css, /provider-compare-date-label\s*\{[^}]*display:\s*none\s*!important/s);
  assert.match(css, /provider-compare-dates[\s\S]*margin-right:\s*0\s*!important/);
  assert.doesNotMatch(css, /padding-right:\s*(?:4[4-9]|5\d|6\d)px\s*!important/);
  assert.match(runtime, /provider-compare-date\.active\[data-provider-compare-date\]/);
  assert.match(runtime, /selected\.getBoundingClientRect\(\)/);
  assert.match(runtime, /scroller\.getBoundingClientRect\(\)/);
  assert.match(runtime, /scroller\.clientWidth/);
  assert.match(runtime, /scroller\.scrollLeft\s*=/);
  assert.doesNotMatch(runtime, /today|今日/i);
  assert.doesNotThrow(() => new vm.Script(runtime));
});
