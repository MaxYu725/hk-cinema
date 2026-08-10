import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function read(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("Phase 8A loads movie-first navigation after the comparison stack", async () => {
  const index = await read("index.html");
  assert.match(index, /phase8a-movie-navigation\.css\?v=8a1/);
  assert.match(index, /phase8a-movie-navigation\.js\?v=8a1/);
  assert.ok(index.indexOf("provider-compare-v3.js") < index.indexOf("phase8a-movie-navigation.js"));
});

test("Phase 8A hides provider-first home affordances and exposes aggregate navigation", async () => {
  const source = await read("phase8a-movie-navigation.js");
  const css = await read("phase8a-movie-navigation.css");

  assert.match(source, /window\.HKCinemaMovieAggregates = Object\.freeze/);
  assert.match(source, /kind: "movie-aggregate"/);
  assert.match(source, /window\.HKCinemaProviderMatches =/);
  assert.match(source, /#movieGrid \.movie-card:not\(\.movie-group-member\)/);
  assert.match(source, /HKCinemaProviderCompare\?\.open/);
  assert.match(source, /data-phase8a-variant-open/);
  assert.match(css, /#homeProviderFilters\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.phase8a-movie-card \.provider-badges/);
  assert.match(css, /\.phase8a-movie-card \.movie-variant-summary/);
});

test("common comparison navigation accepts single-provider movie aggregates", async () => {
  const source = await read("provider-compare-v3.js");
  assert.match(source, /activeProviders\(match\)\.length < 1/);
  assert.doesNotMatch(source, /activeProviders\(match\)\.length < 2/);
});
