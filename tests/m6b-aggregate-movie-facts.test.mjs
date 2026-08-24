import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAsset } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, domain, phase8b, metro] = await Promise.all([
  read("app/index.html"),
  read("app/catalogue-domain.js"),
  read("app/phase8b-comparison-layout.js"),
  read("app/metro-runtime.js")
]);

test("M6B aggregate contract carries structured movie facts from provider catalogues", () => {
  assertAsset(index, "catalogue-domain.js");
  assert.match(domain, /function factsFor\(items, section\)/);
  assert.match(domain, /store\?\.catalogue\?\.\(provider\)/);
  assert.doesNotMatch(domain, /window\.HKCinemaProviders|HKCinemaBroadwayApp|HKCinemaMCLCatalogue|HKCinemaEmperorCatalogue/);
  assert.match(domain, /facts:\s*home\.facts/);
  assert.match(domain, /classification,\s*durationMinutes,\s*releaseDate:/);
});

test("Phase 8B reads aggregate facts instead of parsing rendered homepage metadata", () => {
  assertAsset(index, "phase8b-comparison-layout.js");
  assert.match(phase8b, /const facts = aggregate\?\.facts \|\| \{\}/);
  assert.match(phase8b, /Number\(facts\.durationMinutes\)/);
  assert.doesNotMatch(phase8b, /aggregateCard|\.movie-meta|split\(" · "\)/);
});

test("Metro presentation no longer preserves hidden delimiters for the comparison parser", () => {
  assertAsset(index, "metro-runtime.js");
  assert.match(metro, /function decorateMovieMetadata\(\)/);
  assert.doesNotMatch(metro, /metro-meta-separator/);
  assert.doesNotMatch(metro, /separator\.textContent\s*=\s*" · "/);
});

test("metadata consolidation stays presentation-neutral and does not add provider fetching to Metro", () => {
  assert.doesNotMatch(metro, /fetch\(|API_BASE|providerSourceIds/);
  assert.match(domain, /store\?\.entries\?\.\(section\)/);
  assert.doesNotMatch(domain, /fetch\s*\(/);
  assert.match(phase8b, /visibleFactChips\(facts\)/);
});
