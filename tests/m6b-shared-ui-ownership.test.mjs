import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAssetOrder } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, shared, classic, phase10, metro, sticky, compact] = await Promise.all([
  read("app/index.html"),
  read("app/shared-final-controls.js"),
  read("app/classic-final-ui-polish.js"),
  read("app/phase10r3a-mobile-shell-date-strip.js"),
  read("app/metro-runtime.js"),
  read("app/phase9d0-home-sticky-scroll.js"),
  read("app/phase9b3-filter-compact.js")
]);

test("M6B loads one neutral shared owner before skin-specific final runtimes", () => {
  assertAssetOrder(index, "shared-final-controls.js", "classic-final-ui-polish.js", "phase10r3a-mobile-shell-date-strip.js", "metro-runtime.js");
});

test("tab counts and comparison sort are no longer owned by Classic runtime", () => {
  assert.match(shared, /function syncTabCounts\(\)/);
  assert.match(shared, /dataset\.sharedFinalTabCount\s*=\s*tab/);
  assert.match(shared, /function ensureSortControl\(\)/);
  assert.match(shared, /data-shared-final-sort-select/);
  assert.match(shared, /HKCinemaProviderCompareFilters\?\.setFilter\?\.\("sort"/);
  assert.doesNotMatch(classic, /syncTabCounts|ensureSortControl|HKCinemaProviderCompareFilters/);
  assert.match(classic, /function wireDataHealthRefresh\(\)/);
});

test("Metro home Data Health has one DOM-placement owner", () => {
  assert.match(phase10, /function placeHomeDataHealth\(\)[\s\S]*dataset\.skin === "metro"\) return false/);
  assert.doesNotMatch(phase10, /metroHomeHealth|filters\.appendChild\(panel\)/);
  assert.match(metro, /function moveDataHealthIntoControls\(\)[\s\S]*controls\.appendChild\(panel\)/);
});

test("skin-specific interaction behavior no longer leaks into neutral decorators", () => {
  assert.match(sticky, /dataset\.skin !== "classic"/);
  assert.doesNotMatch(compact, /dataset\.skin|isMetro|queueMetroClose/);
  assert.match(compact, /closeActiveGroup,/);
  assert.match(metro, /function closeActiveFilterGroup\(\)/);
  assert.doesNotMatch(metro, /syncLegacyStickyState/);
});

test("ownership consolidation preserves accepted DOM hooks for both skins", () => {
  assert.match(shared, /className = "classic-final-tab-count"/);
  assert.match(shared, /className = "classic-final-sort shared-final-sort"/);
  assert.match(shared, /dataset\.classicFinalSort = "true"/);
  assert.match(classic, /dataset\.skin === "metro"\) return/);
});
