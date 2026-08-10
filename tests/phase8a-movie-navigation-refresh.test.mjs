import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function read(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("Phase 8A refreshes cached card aggregates after provider catalogues change", async () => {
  const source = await read("phase8a-movie-navigation-refresh.js");
  assert.match(source, /delete card\.dataset\.phase8aAggregateId/);
  assert.match(source, /hkcinema:provider-matches/);
  assert.match(source, /hkcinema:mcl-catalogue/);
  assert.match(source, /hkcinema:emperor-catalogue/);
  assert.match(source, /HKCinemaMovieAggregates\?\.refresh/);
});
