import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAssetOrder } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, css, sw] = await Promise.all([
  read("app/index.html"),
  read("app/metro-m3-smart-picks.css"),
  read("app/sw.js")
]);

test("Metro loads the Smart Picks layer after comparison and filter presentation", () => {
  assertAssetOrder(index, "metro-m3-comparison.css", "metro-m3-filter-matrix.css", "metro-m3-smart-picks.css");
});

test("Metro Smart Picks overrides the legacy mobile carousel with a fixed 2x2 matrix", () => {
  assert.match(css, /phase8d-smart-grid[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  assert.match(css, /grid-auto-flow:\s*row\s*!important/);
  assert.match(css, /grid-auto-columns:\s*auto\s*!important/);
  assert.match(css, /grid-auto-rows:\s*auto\s*!important/);
  assert.match(css, /overflow:\s*visible\s*!important/);
});

test("Metro recommendation cards remain compact and use the Metro accent for decision values", () => {
  assert.match(css, /phase8d-smart-pick[\s\S]*min-height:\s*138px/);
  assert.match(css, /phase8d-smart-pick strong[\s\S]*color:\s*var\(--metro-accent\)/);
  assert.match(css, /phase8d-smart-pick small[\s\S]*flex:\s*0\s+0\s+auto/);
  assert.match(css, /phase8d-smart-pick em[\s\S]*margin-top:\s*auto/);
});

test("Metro all-showtimes heading stays horizontal instead of collapsing to one glyph per line", () => {
  assert.match(css, /phase8b-showtime-heading\s*\{[\s\S]*display:\s*grid\s*!important/);
  assert.match(css, /phase8b-showtime-heading > div[\s\S]*grid-template-columns:\s*max-content\s+minmax\(0,\s*1fr\)\s+auto\s*!important/);
  assert.match(css, /phase8b-showtime-heading h2[\s\S]*white-space:\s*nowrap/);
  assert.match(css, /phase8b-showtime-heading > small[\s\S]*max-width:\s*none/);
});

test("Metro Smart Pick jump highlights the target showtime card border", () => {
  assert.match(css, /provider-compare-show\.is-recommendation-jump[\s\S]*border-color:\s*var\(--metro-accent\)\s*!important/);
  assert.match(css, /provider-compare-show\.is-recommendation-jump[\s\S]*box-shadow:\s*0\s+0\s+0\s+2px\s+var\(--metro-accent\)\s*!important/);
  assert.match(css, /provider-compare-show\.is-recommendation-jump[\s\S]*transform:\s*none\s*!important/);
});

test("Metro Smart Picks remain compatible with the current controlled shell cache", () => {
  assert.match(sw, /CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}c3-1`/);
  assert.doesNotMatch(sw, /install[\s\S]{0,260}skipWaiting\s*\(/);
  assert.match(sw, /event\.data\?\.type\s*===\s*"SKIP_WAITING"/);
});
