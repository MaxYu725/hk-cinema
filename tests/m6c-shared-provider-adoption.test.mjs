import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assetPosition, assertAsset, assertAssetOrder } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function fixture() {
  return JSON.parse(await source("tests/fixtures/provider-contract-minimal.json"));
}

async function loadSharedCoreWithFixture() {
  const sample = await fixture();
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(await source("app/provider-registry.js"), context, { filename: "provider-registry.js" });

  const base = window.HKCinemaProviderRegistry;
  const fixtureProvider = Object.freeze({
    ...sample.provider,
    capabilities: Object.freeze({ ...sample.provider.capabilities })
  });
  const providers = Object.freeze([...base.providers, fixtureProvider]);
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  window.HKCinemaProviderRegistry = Object.freeze({
    ...base,
    providers,
    get(id) {
      return byId.get(String(id || "").toLowerCase()) || null;
    },
    hasCapability(id, capability) {
      return Boolean(byId.get(String(id || "").toLowerCase())?.capabilities?.[capability]);
    }
  });

  vm.runInContext(await source("app/provider-contract.js"), context, { filename: "provider-contract.js" });
  vm.runInContext(await source("app/catalogue-store.js"), context, { filename: "catalogue-store.js" });
  vm.runInContext(await source("app/provider-shared-core.js"), context, { filename: "provider-shared-core.js" });
  return { context, window, sample };
}

test("M6C Checkpoint 3 shared provider core enumerates a future registry provider beyond production", async () => {
  const { window, sample } = await loadSharedCoreWithFixture();
  const core = window.HKCinemaProviderSharedCore;

  assert.equal(typeof core.version, "string");
  assert.ok(core.version.length > 0);
  assert.deepEqual(Array.from(core.providerIds()), ["broadway", "mcl", "emperor", "cineart", "fixture"]);
  assert.deepEqual(Object.keys(core.providerMap(() => [])), ["broadway", "mcl", "emperor", "cineart", "fixture"]);
  assert.equal(core.label("fixture"), "Fixture Cinema");
  assert.deepEqual(Array.from(core.aggregateSourceIds(sample.movieAggregate, "fixture")), ["fixture-movie-1"]);
  assert.deepEqual(
    Array.from(core.activeProvidersForAggregate(sample.movieAggregate), provider => provider.key),
    ["fixture"]
  );
  assert.equal(core.allProviderLabel(2), "兩院線");
  assert.equal(core.allProviderLabel(3), "三院線");
  assert.equal(core.allProviderLabel(4), "4 院線");
});

test("provider without price or seat capability keeps a valid showtime and booking", async () => {
  const { window, sample } = await loadSharedCoreWithFixture();
  const core = window.HKCinemaProviderSharedCore;
  const capabilities = core.showtimeCapabilities("fixture", {
    pricePayload: sample.price,
    seatSummary: sample.seatSummary,
    bookingUrl: sample.showtime.bookingUrl
  });

  assert.equal(capabilities.price.availability, "unsupported");
  assert.equal(capabilities.price.value, null);
  assert.equal(capabilities.seatSummary.availability, "unsupported");
  assert.equal(capabilities.seatSummary.value, null);
  assert.equal(capabilities.booking.availability, "available");
  assert.equal(capabilities.booking.value, sample.showtime.bookingUrl);

  const supportedButMissing = core.showtimeCapabilities("broadway", {
    pricePayload: null,
    seatSummary: null,
    bookingUrl: null
  });
  assert.equal(supportedButMissing.price.availability, "unknown");
  assert.equal(supportedButMissing.seatSummary.availability, "unknown");
  assert.equal(supportedButMissing.booking.availability, "unknown");
});

test("catalogue domain accepts a registry provider without a provider-name branch", async () => {
  const { context, window, sample } = await loadSharedCoreWithFixture();
  vm.runInContext(await source("app/home-discovery-core.js"), context, { filename: "home-discovery-core.js" });
  vm.runInContext(await source("app/showtime-metadata.js"), context, { filename: "showtime-metadata.js" });
  vm.runInContext(await source("app/catalogue-domain.js"), context, { filename: "catalogue-domain.js" });

  window.HKCinemaProviderSharedCore.publishCatalogue("fixture", {
    now: [sample.catalogueEntry],
    coming: []
  });
  const model = window.HKCinemaCatalogueDomain.build("now");
  const aggregate = model.aggregates[0];
  const match = window.HKCinemaProviderMatches.get(aggregate.id);

  assert.equal(aggregate.providerCount, 1);
  assert.deepEqual(Array.from(aggregate.sources.fixture), ["fixture-movie-1"]);
  assert.equal(match.fixture.provider, "fixture");
  assert.equal(match.fixture.sourceId, "fixture-movie-1");
  assert.equal(match.broadway, null);
  assert.equal(match.mcl, null);
  assert.equal(match.emperor, null);
  assert.equal(match.cineart, null);
});

test("production shared home/comparison paths load and consume registry capability ownership", async () => {
  const [index, domain, navigation, compare] = await Promise.all([
    source("app/index.html"),
    source("app/catalogue-domain.js"),
    source("app/phase8a-movie-navigation.js"),
    source("app/provider-compare-v4.js")
  ]);

  assertAssetOrder(index, "provider-registry.js", "provider-contract.js", "catalogue-store.js");
  assertAssetOrder(index, "catalogue-store.js", "provider-shared-core.js");
  const coreIndex = assetPosition(index, "provider-shared-core.js");
  for (const asset of ["multi-provider.js", "provider-compare-v4.js", "phase8a-movie-navigation.js"]) {
    assertAsset(index, asset);
    assert.ok(assetPosition(index, asset) > coreIndex, `${asset} must load after provider-shared-core.js`);
  }

  assert.match(domain, /sharedCore\?\.providers\?\.\(\)/);
  assert.match(domain, /store\?\.entries\?\.\(section\)/);
  assert.match(domain, /Object\.fromEntries\(PROVIDER_IDS\.map/);
  assert.doesNotMatch(domain, /const PROVIDERS = \["broadway", "mcl", "emperor"\];/);
  assert.match(navigation, /data-movie-aggregate-id/);
  assert.doesNotMatch(navigation, /MutationObserver|querySelectorAll/);

  assert.match(compare, /sharedCore\?\.providers\?\.\(\)/);
  assert.match(compare, /availableDates: providerMap\(\(\) => \[\]\)/);
  assert.match(compare, /const normalizer = comparisonAdapter\(provider\)\?\.normalizeSession;/);
  assert.match(compare, /normalizeGenericSession\(provider, session\)/);
  assert.doesNotMatch(compare, /if\s*\(provider\s*===\s*"(?:broadway|mcl|emperor)"\)/);
  assert.match(compare, /data-price-capability=/);
  assert.match(compare, /data-seat-capability=/);
  assert.match(compare, /data-booking-capability=/);
  assert.match(compare, /座位資料不提供/);
  assert.match(compare, /capabilities\.price\.availability === "unsupported"/);
  assert.match(compare, /Object\.fromEntries\(PROVIDERS\.map\(provider => \[/);
});
