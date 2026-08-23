import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("home aggregation preserves provider failures without a base renderer", async () => {
  const [store, domain, multi, index] = await Promise.all([
    source("app/catalogue-store.js"),
    source("app/catalogue-domain.js"),
    source("app/multi-provider.js"),
    source("app/index.html")
  ]);

  assert.match(store, /const fallback = Boolean\(value\?\.meta\?\.fallbackSections\?\.\[section\]\);/);
  assert.match(store, /const usable = Boolean\(value\) && \(!error \|\| fallback\);/);
  assert.match(store, /failed: \(!usable && record\?\.status === "error"\)/);
  assert.match(domain, /summary = store\?\.summary\?\.\(activeSection\)/);
  assert.match(multi, /model\.summary\.loading > 0/);
  assert.match(multi, /summary\.failed === summary\.total/);
  assert.match(multi, /hkcinema:catalogue-store/);
  assert.doesNotMatch(`${domain}\n${multi}`, /baseProvider|alternateProviders|data-broadway-state/);

  assertAsset(index, "catalogue-store.js");
  assertAsset(index, "catalogue-domain.js");
  assertAsset(index, "multi-provider.js");
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
