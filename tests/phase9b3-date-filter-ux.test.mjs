import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/phase9b3-date-filter-ux.css", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../app/phase9b3-filter-compact.js", import.meta.url), "utf8");

test("Phase 9B3 loads after Classic polish and filter scroll stability", () => {
  assert.match(index, /phase9b2-classic-mobile-polish\.css\?v=9b2[\s\S]*phase9b3-date-filter-ux\.css\?v=9b3/);
  assert.match(index, /phase8d1-filter-scroll-stability\.js\?v=8d1[\s\S]*phase9b3-filter-compact\.js\?v=m6b-3/);
});

test("selected date explicitly restores dark active contrast", () => {
  assert.match(css, /html\[data-skin="classic"\] \.provider-compare-date\.active\s*\{[\s\S]*background:\s*var\(--color-accent\);[\s\S]*color:\s*var\(--color-accent-contrast\);/);
  assert.match(css, /\.provider-compare-date\.active strong,[\s\S]*\.provider-compare-date\.active span/);
});

test("today is decorated independently from the selected date", () => {
  assert.match(runtime, /timeZone:\s*"Asia\/Hong_Kong"/);
  assert.match(runtime, /button\.dataset\.phase9b3Today\s*=\s*"true"/);
  assert.match(css, /data-phase9b3-today="true"/);
  assert.match(css, /content:\s*"今日"/);
});

test("mobile date rail uses the true sheet scroll top as a sticky opaque layer", () => {
  assert.match(css, /\.provider-compare-sheet\s*\{[\s\S]*padding-top:\s*0\s*!important/);
  assert.match(css, /#providerCompareContent\s*\{[\s\S]*padding-top:\s*calc\(50px \+ env\(safe-area-inset-top\)\)/);
  assert.match(css, /\.provider-compare-date-rail\.phase8b-date-section\s*\{[\s\S]*position:\s*sticky\s*!important;[\s\S]*top:\s*0\s*!important;[\s\S]*z-index:\s*40/);
  assert.match(css, /background:\s*var\(--color-background\)\s*!important/);
});

test("expanded filters become single-open compact groups without replacing filter controls", () => {
  assert.match(runtime, /let activeGroup = null/);
  assert.match(runtime, /activeGroup = activeGroup === key \? null : key/);
  assert.match(runtime, /phase9b3-filter-group-body/);
  assert.match(runtime, /while \(group\.firstChild\) body\.appendChild\(group\.firstChild\)/);
  assert.match(runtime, /closeActiveGroup,/);
  assert.doesNotMatch(runtime, /dataset\.skin/);
  assert.match(css, /phase9b3-filter-group-summary/);
  assert.match(css, /\[data-phase9b3-group="district"\] \.phase9b3-filter-group-body/);
});
