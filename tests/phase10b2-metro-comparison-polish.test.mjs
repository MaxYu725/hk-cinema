import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 10B2 polish loads after the Metro comparison foundation", async () => {
  const index = await read("app/index.html");

  assert.match(index, /metro-comparison\.css\?v=10b1/);
  assert.match(index, /metro-comparison-polish\.css\?v=10b2-1/);
  assert.match(index, /metro-comparison\.js\?v=10b2/);
  assert.ok(
    index.indexOf("metro-comparison.css?v=10b1") <
    index.indexOf("metro-comparison-polish.css?v=10b2-1")
  );
});

test("recommendation Pivot explicitly removes inherited light-card styling", async () => {
  const css = await read("app/metro-comparison-polish.css");

  assert.match(css, /data-metro-comparison-active-pivot="picks"/);
  assert.match(css, /\.phase8d-smart-pick[\s\S]*min-height:\s*0/);
  assert.match(css, /\.phase8d-smart-pick[\s\S]*height:\s*auto/);
  assert.match(css, /\.phase8d-smart-pick[\s\S]*background:\s*#0d0d0d/);
  assert.match(css, /\.phase8d-smart-pick strong[\s\S]*color:\s*#ffffff/);
  assert.match(css, /\.phase8d-smart-pick small[\s\S]*flex:\s*none/);
  assert.match(css, /\.phase8d-smart-pick\.balanced[\s\S]*border-left-color:\s*var\(--color-accent\)/);
});

test("filter Pivot uses Metro command groups while preserving existing controls", async () => {
  const [css, js] = await Promise.all([
    read("app/metro-comparison-polish.css"),
    read("app/metro-comparison.js")
  ]);

  assert.match(css, /data-metro-comparison-active-pivot="filters"/);
  assert.match(css, /\.provider-compare-filter-toggle[\s\S]*background:\s*#0c0c0c/);
  assert.match(css, /\.provider-compare-reset[\s\S]*position:\s*static/);
  assert.match(css, /\.provider-compare-control-group button[\s\S]*background:\s*#0d0d0d/);
  assert.match(css, /button\.active,[\s\S]*button\[aria-pressed="true"\][\s\S]*background:\s*var\(--color-accent\)/);
  assert.match(css, /\.provider-compare-cinema-control select[\s\S]*background:\s*#0d0d0d/);

  assert.match(js, /function ensureFiltersExpanded\(section\)/);
  assert.match(js, /section\?\.querySelector\("\.phase8c-controls"\)/);
  assert.match(js, /section\.querySelector\("\[data-provider-filter-toggle\]"\)/);
  assert.match(js, /if \(activePivot === "filters"\) ensureFiltersExpanded\(section\)/);
  assert.match(js, /version:\s*"10b2"/);
  assert.doesNotMatch(js, /fetch\s*\(/);
});

test("10B2 styles remain Metro-scoped and do not change Classic surfaces", async () => {
  const css = await read("app/metro-comparison-polish.css");
  const ruleStarts = css
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.endsWith("{") && !line.startsWith("@"));

  assert.ok(ruleStarts.length > 10);
  for (const rule of ruleStarts) {
    assert.match(rule, /html\[data-skin="metro"\]/, `unscoped rule: ${rule}`);
  }
});
