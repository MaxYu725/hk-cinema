import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [index, phase8a, phase8b, metro] = await Promise.all([
  read("app/index.html"),
  read("app/phase8a-movie-navigation.js"),
  read("app/phase8b-comparison-layout.js"),
  read("app/metro-runtime.js")
]);

test("M6B aggregate contract carries structured movie facts from provider catalogues", () => {
  assert.match(index, /phase8a-movie-navigation\.js\?v=m6c-3/);
  assert.match(phase8a, /function factsFromSourceSets\(/);
  assert.match(phase8a, /HKCinemaBroadwayApp\?\.getCatalogue\?\.\(\)/);
  assert.match(phase8a, /HKCinemaMCLCatalogue/);
  assert.match(phase8a, /HKCinemaEmperorCatalogue/);
  assert.match(phase8a, /facts:\s*factsFromSourceSets\(/);
  assert.match(phase8a, /classification, durationMinutes, releaseDate/);
});

test("Phase 8B reads aggregate facts instead of parsing rendered homepage metadata", () => {
  assert.match(index, /phase8b-comparison-layout\.js\?v=m6b-2/);
  assert.match(phase8b, /const facts = aggregate\?\.facts \|\| \{\}/);
  assert.match(phase8b, /Number\(facts\.durationMinutes\)/);
  assert.doesNotMatch(phase8b, /aggregateCard|\.movie-meta|split\(" · "\)/);
});

test("Metro presentation no longer preserves hidden delimiters for the comparison parser", () => {
  assert.match(index, /metro-runtime\.js\?v=m6b-3/);
  assert.match(metro, /function decorateMovieMetadata\(\)/);
  assert.doesNotMatch(metro, /metro-meta-separator/);
  assert.doesNotMatch(metro, /separator\.textContent\s*=\s*" · "/);
});

test("metadata consolidation stays presentation-neutral and does not add provider fetching to Metro", () => {
  assert.doesNotMatch(metro, /fetch\(|API_BASE|providerSourceIds/);
  assert.match(phase8a, /providerCatalogue\(provider\)/);
  assert.match(phase8b, /visibleFactChips\(facts\)/);
});