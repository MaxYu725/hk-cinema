import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Phase 8E3 loads the slim home library runtime and syntax-checks it", async () => {
  const [index, packageJson] = await Promise.all([
    read("app/index.html"),
    read("package.json")
  ]);
  const syntaxScript = JSON.parse(packageJson).scripts["test:syntax"];

  assertAsset(index, "home-library-core.js");
  assertAsset(index, "home-library.js");
  assert.match(syntaxScript, /find app worker\/src scripts/);
  assert.match(syntaxScript, /-name '\*\.js'/);
  assert.match(syntaxScript, /xargs -0 -n 1 node --check/);
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
  assert.match(core, /version:\s*["'][^"']+["']/);
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

  for (const asset of [
    "provider-compare-v4.js",
    "provider-compare-insights-v4.js",
    "provider-compare-preferences-v2.js",
    "provider-compare-recommendations-v4.js"
  ]) assertAsset(index, asset);

  assert.doesNotMatch(index, /<script src="\.\/provider-compare\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-v3\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-insights\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-insights-v3\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-preferences\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-recommendations-v2\.js/);
  assert.doesNotMatch(index, /<script src="\.\/provider-compare-recommendations-v3\.js/);
});
