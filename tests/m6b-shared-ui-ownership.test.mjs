import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, shared, classic, phase10, metro] = await Promise.all([
  read("app/index.html"),
  read("app/shared-final-controls.js"),
  read("app/classic-final-ui-polish.js"),
  read("app/phase10r3a-mobile-shell-date-strip.js"),
  read("app/metro-runtime.js")
]);

test("M6B loads one neutral shared owner before skin-specific final runtimes", () => {
  const sharedIndex = index.indexOf("shared-final-controls.js?v=m6b-1");
  const classicIndex = index.indexOf("classic-final-ui-polish.js?v=classic-final-m6b-1");
  const phase10Index = index.indexOf("phase10r3a-mobile-shell-date-strip.js?v=10r3b-m6b-1");
  const metroIndex = index.indexOf("metro-runtime.js?v=m4-1");
  assert.ok(sharedIndex >= 0);
  assert.ok(classicIndex > sharedIndex);
  assert.ok(phase10Index > classicIndex);
  assert.ok(metroIndex > phase10Index);
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

test("ownership consolidation preserves accepted DOM hooks for both skins", () => {
  assert.match(shared, /className = "classic-final-tab-count"/);
  assert.match(shared, /className = "classic-final-sort shared-final-sort"/);
  assert.match(shared, /dataset\.classicFinalSort = "true"/);
  assert.match(classic, /dataset\.skin === "metro"\) return/);
});
