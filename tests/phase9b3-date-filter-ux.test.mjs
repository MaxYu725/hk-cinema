import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertAssetOrder } from "./index-assets.mjs";

const index = readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
const comparison = readFileSync(new URL("../app/metro-m3-comparison.css", import.meta.url), "utf8");
const filters = readFileSync(new URL("../app/metro-m3-filter-matrix.css", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../app/phase9b3-filter-compact.js", import.meta.url), "utf8");

test("Metro owns date and filter presentation while the compact runtime remains shared", () => {
  assertAssetOrder(index, "metro-m3-comparison.css", "metro-m3-filter-matrix.css");
  assertAssetOrder(index, "phase8d1-filter-scroll-stability.js", "phase9b3-filter-compact.js");
  assert.doesNotMatch(runtime, /dataset\.skin|classic/i);
});

test("selected dates retain explicit Metro contrast", () => {
  assert.match(comparison, /provider-compare-date\.active[\s\S]*background:\s*var\(--metro-accent\)/);
  assert.match(comparison, /provider-compare-date\.active span[\s\S]*color:/);
});

test("today metadata and single-open compact filters remain behavioral contracts", () => {
  assert.match(runtime, /timeZone:\s*"Asia\/Hong_Kong"/);
  assert.match(runtime, /button\.dataset\.phase9b3Today\s*=\s*"true"/);
  assert.match(runtime, /let activeGroup = null/);
  assert.match(runtime, /activeGroup = activeGroup === key \? null : key/);
  assert.match(runtime, /phase9b3-filter-group-body/);
  assert.match(runtime, /closeActiveGroup,/);
  assert.match(filters, /phase9b3-filter-group-summary/);
  assert.match(filters, /\[data-phase9b3-group="district"\]/);
});
