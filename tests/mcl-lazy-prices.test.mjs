import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("production loads MCL lazy price enrichment beside lazy seat enrichment", async () => {
  const index = await read("app/index.html");
  const seats = index.indexOf("provider-compare-seats.js?v=6o1");
  const prices = index.indexOf("provider-compare-prices.js?v=8d3");
  const recommendations = index.indexOf("provider-compare-recommendations-v4.js?v=8d1");

  assert.ok(seats >= 0);
  assert.ok(prices > seats);
  assert.ok(recommendations > prices);
});

test("lazy price runtime only targets missing MCL prices near the viewport", async () => {
  const source = await read("app/provider-compare-prices.js");

  assert.match(source, /\.provider-compare-source\.mcl/);
  assert.match(source, /function hasPrice\(card\)/);
  assert.match(source, /GetPrice\.aspx\?l=1&si=/);
  assert.match(source, /const MAX_CONCURRENT = 4/);
  assert.match(source, /rootMargin: "600px 0px"/);
  assert.match(source, /const CACHE_MAX_AGE_MS = 5 \* 60 \* 1000/);
  assert.match(source, /data\.priceLoaded|dataset\.priceLoaded/);
});

test("lazy price runtime preserves lifecycle cancellation and never requests a whole movie eagerly", async () => {
  const source = await read("app/provider-compare-prices.js");

  assert.match(source, /IntersectionObserver/);
  assert.match(source, /hkcinema:provider-compare-lifecycle/);
  assert.match(source, /cancelPendingWork/);
  assert.doesNotMatch(source, /querySelectorAll\([^\n]*provider-compare-show[^\n]*\)\.forEach\(enqueue/);
  assert.match(source, /window\.HKCinemaProviderComparePrices/);
  assert.match(source, /version: "8d3"/);
});
