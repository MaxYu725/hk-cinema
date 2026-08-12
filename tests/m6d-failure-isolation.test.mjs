import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("home aggregation waits only for Broadway loading and preserves alternate providers", async () => {
  const [app, multi, index] = await Promise.all([
    source("app/app.js"),
    source("app/multi-provider.js"),
    source("app/index.html")
  ]);

  assert.match(app, /setBroadwayGridState\("loading"\)/);
  assert.match(app, /setBroadwayGridState\("error"\)/);
  assert.match(app, /setBroadwayGridState\("empty"\)/);
  assert.match(app, /setBroadwayGridState\("ready"\)/);

  assert.match(multi, /if \(broadwayState === "loading"\) return;/);
  assert.match(multi, /const hasAlternateCatalogue = Boolean\(mclCatalogue \|\| emperorCatalogue\);/);
  assert.match(multi, /const hasAlternateMovies = mclMovies\.length > 0 \|\| emperorMovies\.length > 0;/);
  assert.match(multi, /grid\.querySelector\("\.empty-state"\)\?\.remove\(\);/);
  assert.match(multi, /renderCombinedEmptyState\(broadwayState\);/);
  assert.doesNotMatch(multi, /if \(count\.textContent\.trim\(\) === "—"\) return;/);

  assert.match(index, /app\.js\?v=7b2-m6d1/);
  assert.match(index, /multi-provider\.js\?v=8e2-m6d1/);
});

test("partial and stale showtime states remain isolated per provider", async () => {
  const [compare, resilience] = await Promise.all([
    source("app/provider-compare-v4.js"),
    source("app/provider-compare-resilience-v3.js")
  ]);

  assert.match(compare, /await Promise\.allSettled\(providers\.map\(provider => fetchProvider/);
  assert.match(compare, /await Promise\.allSettled\(sourceIds\.map\(sourceId => fetchProviderSource/);
  assert.match(compare, /_partialError: failures\.length/);
  assert.match(compare, /state\.data\[key\] = null;\s*state\.errors\[key\] = errorMessage/);

  assert.match(resilience, /status: "stale", label: "資料過期"/);
  assert.match(resilience, /status: "empty", label: "暫無場次"/);
  assert.match(resilience, /目前有 \$\{providers\.length - errors\.length\}\/\$\{providers\.length\} 個院線資料可用/);
  assert.match(resilience, /formatAge\?\.\(freshness\.updatedAt\)/);
});

test("price and seat enrichment failures do not invalidate showtime cards", async () => {
  const [compare, prices, seats] = await Promise.all([
    source("app/provider-compare-v4.js"),
    source("app/provider-compare-prices.js"),
    source("app/provider-compare-seats.js")
  ]);

  assert.match(compare, /<article class="provider-compare-show/);
  assert.match(compare, /capabilities\.price\.availability === "unsupported"/);
  assert.match(compare, /capabilities\.seatSummary\.availability === "unsupported"/);

  assert.match(prices, /function setError\(card\)/);
  assert.match(prices, /node\.textContent = "—"/);
  assert.match(prices, /card\.dataset\.priceError = "true"/);
  assert.doesNotMatch(prices, /setError\(card\)[\s\S]{0,500}card\.remove\(\)/);

  assert.match(seats, /function setError\(card\)/);
  assert.match(seats, /seat\.textContent = "座位暫不可用"/);
  assert.match(seats, /card\.dataset\.seatError = "true"/);
  assert.doesNotMatch(seats, /setError\(card\)[\s\S]{0,500}card\.remove\(\)/);
});
