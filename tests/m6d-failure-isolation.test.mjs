import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("home aggregation waits for the base renderer while preserving alternate provider failures independently", async () => {
  const [app, multi, index] = await Promise.all([
    source("app/app.js"),
    source("app/multi-provider.js"),
    source("app/index.html")
  ]);

  // Broadway is still the current stable base renderer and continues to publish its
  // local grid lifecycle. The shared aggregator must consume that lifecycle neutrally.
  assert.match(app, /setBroadwayGridState\("loading"\)/);
  assert.match(app, /setBroadwayGridState\("error"\)/);
  assert.match(app, /setBroadwayGridState\("empty"\)/);
  assert.match(app, /setBroadwayGridState\("ready"\)/);

  assert.match(multi, /const base = baseProvider\(\);/);
  assert.match(multi, /if \(baseState === "loading"\) return;/);
  assert.match(multi, /const alternateProviders = PROVIDERS\.filter\(provider => provider\.key !== base\);/);
  assert.match(multi, /const sectionStates = new Map\(alternateProviders\.map/);
  assert.match(multi, /const alternateMovies = new Map\(alternateProviders\.map/);
  assert.match(multi, /const error = catalogue\.meta\?\.errors\?\.\[section\];/);
  assert.match(multi, /const fallback = Boolean\(catalogue\.meta\?\.fallbackSections\?\.\[section\]\);/);
  assert.match(multi, /failed: Boolean\(error\) && !fallback/);
  assert.match(multi, /Array\.from\(sectionStates\.values\(\)\)\.some\(state => state\.usable\)/);
  assert.match(multi, /Array\.from\(sectionStates\.values\(\)\)\.some\(state => state\.failed\)/);
  assert.match(multi, /Array\.from\(alternateMovies\.values\(\)\)\.some\(movies => movies\.length > 0\)/);
  assert.match(multi, /grid\.querySelector\("\.empty-state"\)\?\.remove\(\);/);
  assert.match(multi, /renderCombinedEmptyState\(baseState, hasAlternateFailure\);/);
  assert.match(multi, /hkcinema:data-health/);
  assert.doesNotMatch(multi, /if \(count\.textContent\.trim\(\) === "—"\) return;/);

  assert.match(index, /app\.js\?v=7b2-m6d1/);
  assert.match(index, /multi-provider\.js\?v=8e2-m7r2-1/);
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
  assert.match(resilience, /目前有 \$\{active\.length - errors\.length\}\/\$\{active\.length\} 個院線資料可用/);
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
