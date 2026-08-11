import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [css, runtime, recommendations] = await Promise.all([
  read("app/phase10r3a-mobile-shell-date-strip.css"),
  read("app/phase10r3a-mobile-shell-date-strip.js"),
  read("app/provider-compare-recommendations-v4.js")
]);

test("Phase 10R3B places comparison health after movie identity instead of above the poster", () => {
  assert.match(runtime, /function placeComparisonDataHealth\(\)/);
  assert.match(runtime, /const hero = content\?\.querySelector\("\.provider-compare-hero"\)/);
  assert.match(runtime, /const firstSection = content\?\.querySelector\("\.provider-compare-section"\)/);
  assert.match(runtime, /firstSection\.insertAdjacentElement\("beforebegin", panel\)/);
  assert.match(runtime, /panel\.dataset\.phase10r3bComparisonHealth = "below-hero"/);
  assert.doesNotThrow(() => new vm.Script(runtime));
});

test("Phase 10R3B removes grey backing layers without removing sticky date controls", () => {
  assert.match(css, /provider-compare-date-rail\.phase8b-date-section[\s\S]*border-bottom:\s*0\s*!important[\s\S]*background:\s*var\(--color-surface\)\s*!important[\s\S]*box-shadow:\s*none\s*!important/s);
  assert.match(css, /provider-compare-date-rail\.phase8b-date-section::before[\s\S]*content:\s*none\s*!important/s);
  assert.match(css, /provider-compare-insights\.phase8b-filter-section[\s\S]*padding:\s*0\s*!important[\s\S]*border:\s*0\s*!important[\s\S]*background:\s*transparent\s*!important/s);
  assert.match(css, /phase8b-filter-section \.provider-compare-filter-bar[\s\S]*border-top:\s*0\s*!important/s);
});

test("Phase 10R3B resets the mobile Smart Picks grid to normal row flow", () => {
  assert.match(css, /phase8b-recommendation-panel \.phase8d-smart-grid[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/s);
  assert.match(css, /grid-auto-flow:\s*row\s*!important/);
  assert.match(css, /grid-auto-columns:\s*auto\s*!important/);
  assert.match(css, /grid-auto-rows:\s*auto\s*!important/);
  assert.match(css, /phase8d-smart-pick small[\s\S]*flex:\s*0 0 auto/s);
});

test("Phase 10R3B recommendations require today's showtime to be strictly later than the current Hong Kong minute", () => {
  assert.match(recommendations, /entry\.timeMinutes\s*>\s*clock\.minutes/);
  assert.doesNotMatch(recommendations, /entry\.timeMinutes\s*>=\s*clock\.minutes/);
  assert.doesNotThrow(() => new vm.Script(recommendations));
});
