import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assetPosition, assertAsset } from "./index-assets.mjs";

const APP = new URL("../app/", import.meta.url);

async function read(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("movie-first navigation loads after the active comparison engine", async () => {
  const index = await read("index.html");
  assertAsset(index, "phase8a-movie-navigation.css");
  assertAsset(index, "phase8a-movie-navigation.js");
  assertAsset(index, "provider-compare-v4.js");
  assert.ok(assetPosition(index, "phase8a-movie-navigation.js") > assetPosition(index, "provider-compare-v4.js"));
});

test("movie-first home keeps data-backed aggregate navigation without migration UI", async () => {
  const source = await read("phase8a-movie-navigation.js");
  const domain = await read("catalogue-domain.js");
  const css = await read("phase8a-movie-navigation.css");

  assert.match(domain, /window\.HKCinemaMovieAggregates = Object\.freeze/);
  assert.match(domain, /kind: "movie-aggregate"/);
  assert.match(domain, /window\.HKCinemaProviderMatches =/);
  assert.match(source, /closest\?\.\("#movieGrid \[data-movie-aggregate-id\]"\)/);
  assert.match(source, /HKCinemaProviderCompare\?\.open/);
  assert.match(source, /version:\s*["'][^"']+["']/);
  assert.doesNotMatch(source, /data-phase8a-variant-open/);
  assert.doesNotMatch(source, /phase8a-version-rail/);
  assert.doesNotMatch(source, /MutationObserver|querySelectorAll/);
  assert.doesNotMatch(css, /homeProviderFilters/);
  assert.doesNotMatch(css, /provider-badges/);
  assert.doesNotMatch(css, /movie-variant-summary/);
  assert.doesNotMatch(css, /phase8a-version-rail/);
});

test("common comparison navigation accepts single-provider movie aggregates", async () => {
  const source = await read("provider-compare-v4.js");
  assert.match(source, /activeProviders\(match\)\.length < 1/);
  assert.doesNotMatch(source, /activeProviders\(match\)\.length < 2/);
});
