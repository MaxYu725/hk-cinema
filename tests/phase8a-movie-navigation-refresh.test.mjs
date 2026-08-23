import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APP = new URL("../app/", import.meta.url);

async function read(path) {
  return readFile(new URL(path, APP), "utf8");
}

test("C3 rebuilds aggregates from catalogue-store publication before rendering", async () => {
  const [store, domain, renderer] = await Promise.all([
    read("catalogue-store.js"),
    read("catalogue-domain.js"),
    read("multi-provider.js")
  ]);
  assert.match(store, /dispatchEvent\(new CustomEvent\("hkcinema:catalogue-store"/);
  assert.match(renderer, /addEventListener\("hkcinema:catalogue-store", scheduleRender\)/);
  assert.match(renderer, /const model = domain\.build\(activeSection\)/);
  assert.match(domain, /HKCinemaMovieAggregates = Object\.freeze/);
  assert.match(domain, /window\.HKCinemaMultiProvider\?\.refresh\?\.\(\)/);
  assert.doesNotMatch(`${store}\n${domain}\n${renderer}`, /hkcinema:mcl-catalogue|hkcinema:emperor-catalogue/);
});
