import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
  vm.runInContext(await source("app/provider-shared-core.js"), context, { filename: "provider-shared-core.js" });
  return { window, sample };
}

test("M6C Checkpoint 3 shared provider core enumerates a fourth registry provider", async () => {
  const { window, sample } = await loadSharedCoreWithFixture();
  const core = window.HKCinemaProviderSharedCore;

  assert.equal(core.version, "m6c-3");
  assert.deepEqual(Array.from(core.providerIds()), ["broadway", "mcl", "emperor", "fixture"]);
  assert.deepEqual(Object.keys(core.providerMap(() => [])), ["broadway", "mcl", "emperor", "fixture"]);
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

test("Phase 8A movie aggregation accepts a registry provider card without a provider-name branch", async () => {
  const { window, sample } = await loadSharedCoreWithFixture();
  window.addEventListener = () => {};

  class MutationObserver {
    observe() {}
  }

  const document = {
    body: {},
    querySelectorAll() { return []; }
  };
  const context = vm.createContext({
    window,
    document,
    MutationObserver,
    requestAnimationFrame(callback) { callback(); }
  });

  vm.runInContext(await source("app/phase8a-movie-navigation.js"), context, {
    filename: "phase8a-movie-navigation.js"
  });

  const classes = new Set();
  const title = { textContent: sample.movieAggregate.title.display };
  const secondary = { textContent: sample.movieAggregate.title.secondary };
  const card = {
    dataset: {
      provider: "fixture",
      sourceId: "fixture-movie-1",
      homeReleaseDate: "2026-08-12"
    },
    classList: {
      contains(value) { return classes.has(value); },
      add(...values) { values.forEach(value => classes.add(value)); }
    },
    querySelector(selector) {
      if (selector === ".movie-info h3" || selector === "h3") return title;
      if (selector === ".movie-title-en") return secondary;
      return null;
    },
    setAttribute() {},
    hasAttribute() { return false; },
    tabIndex: -1
  };

  const aggregate = window.HKCinemaMovieAggregates.forCard(card);
  const match = window.HKCinemaProviderMatches.get(aggregate.id);

  assert.equal(aggregate.providerCount, 1);
  assert.deepEqual(Array.from(aggregate.sources.fixture), ["fixture-movie-1"]);
  assert.equal(match.fixture.provider, "fixture");
  assert.equal(match.fixture.sourceId, "fixture-movie-1");
  assert.equal(match.broadway, null);
  assert.equal(match.mcl, null);
  assert.equal(match.emperor, null);
});

test("production shared home/comparison paths load and consume registry capability ownership", async () => {
  const [index, phase8a, compare] = await Promise.all([
    source("app/index.html"),
    source("app/phase8a-movie-navigation.js"),
    source("app/provider-compare-v4.js")
  ]);

  const registryIndex = index.indexOf("provider-registry.js?v=m6c-1");
  const contractIndex = index.indexOf("provider-contract.js?v=m6c-2.1");
  const coreIndex = index.indexOf("provider-shared-core.js?v=m6c-3");
  const multiProviderIndex = index.indexOf("multi-provider.js?v=");
  const compareIndex = index.indexOf("provider-compare-v4.js?v=m6c-3");
  const phase8aIndex = index.indexOf("phase8a-movie-navigation.js?v=m6c-3");

  assert.ok(registryIndex >= 0 && registryIndex < contractIndex);
  assert.ok(contractIndex < coreIndex);
  assert.ok(coreIndex < multiProviderIndex);
  assert.ok(coreIndex < compareIndex);
  assert.ok(coreIndex < phase8aIndex);

  assert.match(phase8a, /sharedCore\?\.providerIds\?\.\(\)/);
  assert.match(phase8a, /card\?\.dataset\?\.provider/);
  assert.match(phase8a, /providerEntries = Object\.fromEntries\(PROVIDERS\.map/);
  assert.doesNotMatch(phase8a, /const PROVIDERS = \["broadway", "mcl", "emperor"\];/);

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