import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 10B1 loads after the existing comparison layout without forking Classic", async () => {
  const [index, js] = await Promise.all([
    read("app/index.html"),
    read("app/metro-comparison.js")
  ]);

  assert.match(index, /metro-comparison\.css\?v=10b1/);
  assert.match(index, /metro-comparison\.js\?v=10b\d+/);
  assert.ok(index.indexOf("phase8b-comparison-layout.js?v=8b1") < index.indexOf("metro-comparison.js?v="));
  assert.match(js, /document\.documentElement\.dataset\.skin !== "metro"/);
  assert.match(js, /window\.HKCinemaProviderCompare\?\.getState\?\.\(\)/);
  assert.doesNotMatch(js, /fetch\s*\(/);
  assert.doesNotMatch(js, /API_BASE/);
});

test("Metro comparison exposes three Pivot destinations with keyboard navigation", async () => {
  const js = await read("app/metro-comparison.js");

  for (const key of ["showtimes", "picks", "filters"]) {
    assert.match(js, new RegExp(`key: \\"${key}\\"`));
  }
  for (const label of ["場次", "推薦", "篩選"]) {
    assert.match(js, new RegExp(`label: \\"${label}\\"`));
  }
  assert.match(js, /nav\.dataset\.metroComparisonPivot\s*=\s*"true"/);
  assert.match(js, /root\.dataset\.metroComparisonActivePivot\s*=\s*activePivot/);
  assert.match(js, /section\.dataset\.metroComparisonActivePivot\s*=\s*activePivot/);
  assert.doesNotMatch(js, /root\.dataset\.metroComparisonPivot\s*=\s*activePivot/);
  assert.match(js, /role="tablist"/);
  assert.match(js, /role="tab"/);
  assert.match(js, /aria-selected/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /Home/);
  assert.match(js, /End/);
  assert.match(js, /hkcinema:metro-comparison-pivot/);
});

test("Metro comparison styling remains scoped and establishes a fullscreen Panorama shell", async () => {
  const css = await read("app/metro-comparison.css");

  assert.match(css, /html\[data-skin="metro"\] \.provider-compare-sheet[\s\S]*width:\s*100%/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.metro-comparison-pivot[\s\S]*position:\s*sticky/);
  assert.match(css, /\.metro-comparison-pivot-tab[\s\S]*font-weight:\s*300/);
  assert.match(css, /\.metro-comparison-pivot-hidden[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.provider-compare-hero\.metro-comparison-panorama/);
  assert.doesNotMatch(css, /(^|\n)\.provider-compare-sheet\s*\{/);
});
