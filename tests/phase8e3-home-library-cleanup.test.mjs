import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Phase 8E3 loads the slim home library runtime and syntax-checks it", async () => {
  const [index, packageJson] = await Promise.all([
    read("app/index.html"),
    read("package.json")
  ]);

  assert.match(index, /home-library-core\.js\?v=8e3/);
  assert.match(index, /home-library\.js\?v=8e3/);
  assert.match(packageJson, /node --check app\/home-library-core\.js/);
  assert.match(packageJson, /node --check app\/home-library\.js/);
});

test("retired homepage facet, provider and hidden region plumbing is gone", async () => {
  const [library, core] = await Promise.all([
    read("app/home-library.js"),
    read("app/home-library-core.js")
  ]);

  for (const retired of [
    "homeProviderFilters",
    "HKCinemaHomeProviderFilters",
    "providerVisible",
    "data-home-facet",
    "data-home-region",
    "provider-compare-filters:v1",
    "restoreRegionPreferenceToCompare",
    "FILTERS_COLLAPSED_KEY",
    "filtersCollapsed"
  ]) {
    assert.doesNotMatch(library, new RegExp(retired.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(core, /FACET_DEFINITIONS/);
  assert.doesNotMatch(core, /extractFacets/);
  assert.doesNotMatch(core, /facetMatches/);
  assert.doesNotMatch(core, /mode === "providers"/);
  assert.match(core, /version: "8e3"/);
});

test("homepage controls stay movie-first after the cleanup", async () => {
  const library = await read("app/home-library.js");

  assert.match(library, /placeholder="搜尋電影"/);
  assert.match(library, /<option value="release" data-home-release-sort>/);
  assert.match(library, /<option value="title">片名<\/option>/);
  assert.doesNotMatch(library, /<option value="providers">/);
  assert.match(library, /data-home-library-view="favorites"/);
  assert.match(library, /data-home-library-view="recent"/);
  assert.match(library, /HKCinemaMovieGroups/);
});

test("production keeps only the current comparison generations while historical files remain repository-only", async () => {
  const index = await read("app/index.html");

  assert.match(index, /provider-compare-v4\.js\?v=8c1/);
  assert.match(index, /provider-compare-insights-v4\.js\?v=8c1/);
  assert.match(index, /provider-compare-preferences-v2\.js\?v=8c1/);
  assert.match(index, /provider-compare-recommendations-v4\.js\?v=10r3b-1/);

  assert.doesNotMatch(index, /<script src="\.\/provider-compare\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-v3\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-insights\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-insights-v3\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-preferences\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-recommendations-v2\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-recommendations-v3\.js/);
});
