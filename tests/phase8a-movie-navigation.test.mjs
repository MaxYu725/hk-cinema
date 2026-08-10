import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function read(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("movie-first navigation loads after the active comparison engine", async () => {
  const index = await read("index.html");
  const compare = index.indexOf("provider-compare-v4.js");
  const navigation = index.indexOf("phase8a-movie-navigation.js");

  assert.match(index, /phase8a-movie-navigation\.css\?v=8e2/);
  assert.match(index, /phase8a-movie-navigation\.js\?v=8e1/);
  assert.ok(compare >= 0);
  assert.ok(navigation > compare);
});

test("movie-first home keeps aggregate navigation without migration UI", async () => {
  const source = await read("phase8a-movie-navigation.js");
  const css = await read("phase8a-movie-navigation.css");

  assert.match(source, /window\.HKCinemaMovieAggregates = Object\.freeze/);
  assert.match(source, /kind: "movie-aggregate"/);
  assert.match(source, /window\.HKCinemaProviderMatches =/);
  assert.match(source, /#movieGrid \.movie-card:not\(\.movie-group-member\)/);
  assert.match(source, /HKCinemaProviderCompare\?\.open/);
  assert.match(source, /version: "8e1"/);
  assert.doesNotMatch(source, /data-phase8a-variant-open/);
  assert.doesNotMatch(source, /phase8a-version-rail/);
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
