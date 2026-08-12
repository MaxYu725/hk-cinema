import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  index,
  theme,
  comparison,
  filters,
  picks,
  seat,
  metro,
  classic,
  phase10,
  sticky,
  compact,
  phase8b,
  architecture
] = await Promise.all([
  read("app/index.html"),
  read("app/metro-theme.css"),
  read("app/metro-m3-comparison.css"),
  read("app/metro-m3-filter-matrix.css"),
  read("app/metro-m3-smart-picks.css"),
  read("app/metro-m4-seat-view.css"),
  read("app/metro-runtime.js"),
  read("app/classic-final-ui-polish.js"),
  read("app/phase10r3a-mobile-shell-date-strip.js"),
  read("app/phase9d0-home-sticky-scroll.js"),
  read("app/phase9b3-filter-compact.js"),
  read("app/phase8b-comparison-layout.js"),
  read("docs/m6b-architecture-map.md")
]);

test("M6B ends with five distinct Metro presentation owners and no retired patch links", () => {
  const links = [
    "metro-theme.css?v=m6b-5",
    "metro-m3-comparison.css?v=m3-1",
    "metro-m3-filter-matrix.css?v=m3-filter-3",
    "metro-m3-smart-picks.css?v=m3-picks-2",
    "metro-m4-seat-view.css?v=m6b-4"
  ];
  let previous = -1;
  for (const link of links) {
    const position = index.indexOf(link);
    assert.ok(position > previous, `${link} should follow the previous Metro owner`);
    previous = position;
  }
  assert.doesNotMatch(index, /metro-m2-home-polish\.css|metro-m4b-seat-scroll-fix\.css/);
});

test("remaining Metro CSS files have feature-specific ownership markers", () => {
  assert.match(theme, /Phase M2: real-device homepage polish, consolidated into the owning Metro theme during M6B/);
  assert.match(theme, /\.home-library-primary/);

  assert.match(comparison, /\.provider-compare-sheet/);
  assert.match(comparison, /\.metro-compare-nav/);

  assert.match(filters, /M3 filter matrix/);
  assert.match(filters, /data-phase9b3-group/);
  assert.match(filters, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);

  assert.match(picks, /phase8d-smart-grid/);
  assert.match(picks, /is-recommendation-jump/);

  assert.match(seat, /\.shared-seatmap-sheet/);
  assert.match(seat, /data-seatmap-provider="broadway"/);
  assert.doesNotMatch(seat.match(/data-seatmap-provider="broadway"[\s\S]*?\.shared-seatmap-row-label\s*\{[^}]*\}/)?.[0] || "", /data-seatmap-provider="mcl"|data-seatmap-provider="emperor"/);
});

test("Classic and shared legacy runtimes no longer own Metro presentation state", () => {
  assert.match(classic, /function wireDataHealthRefresh\(\)[\s\S]*dataset\.skin === "metro"\) return/);
  assert.doesNotMatch(classic, /syncTabCounts|ensureSortControl/);

  assert.match(phase10, /function placeHomeDataHealth\(\)[\s\S]*dataset\.skin === "metro"\) return false/);
  assert.match(phase10, /function placeComparisonDataHealth\(\)[\s\S]*dataset\.skin === "metro"\) return false/);
  assert.match(phase10, /function centerSelectedDate\(\)/);

  assert.match(sticky, /dataset\.skin !== "classic"/);
  assert.doesNotMatch(compact, /dataset\.skin|isMetro|queueMetroClose/);
  assert.match(metro, /function closeActiveFilterGroup\(\)/);
  assert.doesNotMatch(metro, /syncLegacyStickyState/);
});

test("shared data contracts are independent from Metro rendered metadata", () => {
  assert.match(phase8b, /const facts = aggregate\?\.facts \|\| \{\}/);
  assert.doesNotMatch(phase8b, /aggregateCard|\.movie-meta|split\(" · "\)/);
  assert.match(metro, /function decorateMovieMetadata\(\)/);
  assert.doesNotMatch(metro, /fetch\(|API_BASE|providerSourceIds/);
});

test("architecture map records the M6B stop condition and M6C handoff", () => {
  for (const phrase of [
    "Why M6B stops consolidating here",
    "do not perform further presentation-file folding",
    "proceed to M6C provider onboarding contracts",
    "M6A risk closure",
    "M6B regression invariants"
  ]) {
    assert.match(architecture, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
