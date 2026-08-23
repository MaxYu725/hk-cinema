import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

const CAPABILITY_KEYS = Object.freeze([
  "catalogue",
  "showtimes",
  "prices",
  "seatSummary",
  "seatMap",
  "booking"
]);

function registryWithFixture({ fixtureOnly = false } = {}) {
  const current = [
    {
      id: "broadway",
      displayName: "Broadway",
      healthLabel: "Broadway",
      capabilities: { catalogue: true, showtimes: true, prices: true, seatSummary: true, seatMap: true, booking: true }
    },
    {
      id: "mcl",
      displayName: "MCL",
      healthLabel: "MCL",
      capabilities: { catalogue: true, showtimes: true, prices: true, seatSummary: true, seatMap: true, booking: true }
    },
    {
      id: "emperor",
      displayName: "Emperor Cinemas",
      healthLabel: "Emperor",
      capabilities: { catalogue: true, showtimes: true, prices: true, seatSummary: true, seatMap: true, booking: true }
    }
  ];
  const fixture = {
    id: "fixture",
    displayName: "Fixture Cinema",
    healthLabel: "Fixture",
    capabilities: { catalogue: true, showtimes: true, prices: false, seatSummary: false, seatMap: false, booking: true }
  };
  const providers = (fixtureOnly ? [fixture] : [...current, fixture]).map(provider => Object.freeze(provider));
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  return Object.freeze({
    providers: Object.freeze(providers),
    capabilityKeys: CAPABILITY_KEYS,
    get(id) { return byId.get(String(id || "").trim().toLowerCase()) || null; },
    hasCapability(id, capability) { return Boolean(this.get(id)?.capabilities?.[capability]); }
  });
}

function fixtureMovie() {
  return {
    id: "fixture:fixture-movie-1",
    sourceId: "fixture-movie-1",
    title: { zh: "第四院線整合測試", en: "Fourth Provider Integration Fixture" },
    classification: "IIB",
    durationMinutes: 123,
    releaseDate: "2026-08-15",
    posterUrl: "https://fixture.example/poster.jpg",
    bookingUrl: "https://fixture.example/movie"
  };
}

function fixtureShowtime() {
  return {
    id: "fixture:fixture-session-1",
    sourceId: "fixture-session-1",
    date: "2026-08-15",
    time: "18:30",
    cinema: { id: "fixture-harbour", name: { zh: "Fixture Harbour Cinema" } },
    house: { id: "hall-1", name: "House 1" },
    bookingUrl: "https://fixture.example/book",
    price: { display: 98, adult: 98 },
    seatSummary: { total: 100, available: 60, occupiedPercent: 40 },
    purchase: {
      scheduleKey: "MUST-NOT-BECOME-EMPEROR",
      canPurchase: true
    }
  };
}

function homeCard() {
  const classes = new Set(["movie-card", "provider-only-card", "fixture-only-card"]);
  const attributes = new Map();
  return {
    dataset: {
      provider: "fixture",
      sourceId: "fixture-movie-1",
      providerSources: JSON.stringify({ fixture: "fixture-movie-1" }),
      homeReleaseDate: "2026-08-15"
    },
    classList: {
      contains(name) { return classes.has(name); },
      add(...names) { names.forEach(name => classes.add(name)); }
    },
    querySelector(selector) {
      if (selector === ".movie-info h3" || selector === "h3") return { textContent: "第四院線整合測試" };
      if (selector === ".movie-title-en") return { textContent: "Fourth Provider Integration Fixture" };
      if (selector === ".movie-poster img") return { src: "https://fixture.example/poster.jpg" };
      return null;
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    hasAttribute(name) { return attributes.has(name); },
    getAttribute(name) { return attributes.get(name) || null; },
    tabIndex: -1
  };
}

function comparisonCard() {
  return {
    dataset: {
      provider: "fixture",
      showLanguage: "english",
      showSubtitle: "chinese",
      showFormat: "2d"
    },
    hidden: false,
    querySelector(selector) {
      if (selector === ".provider-compare-source") {
        return {
          textContent: "Fixture Cinema",
          classList: { contains() { return false; } }
        };
      }
      if (selector === ".provider-compare-show-time") return { textContent: "18:30" };
      if (selector === ".provider-compare-show-topline strong") return { textContent: "Fixture Harbour Cinema" };
      if (selector === ".provider-compare-show-price") return { textContent: "不提供" };
      if (selector === ".provider-compare-seat") return { textContent: "座位資料不提供" };
      return null;
    }
  };
}

function createHarness({ fixtureOnly = false } = {}) {
  const content = { innerHTML: "" };
  const overlay = {
    hidden: true,
    querySelector(selector) {
      return selector === "#providerCompareContent" ? content : null;
    }
  };
  const bodyClasses = new Set();
  const document = {
    readyState: "loading",
    activeElement: null,
    body: {
      classList: {
        add(...names) { names.forEach(name => bodyClasses.add(name)); },
        remove(...names) { names.forEach(name => bodyClasses.delete(name)); }
      },
      appendChild() {}
    },
    addEventListener() {},
    querySelector(selector) {
      return selector === "#providerCompareOverlay" ? overlay : null;
    },
    querySelectorAll() { return []; },
    createElement() {
      return {
        dataset: {},
        classList: { add() {}, remove() {} },
        setAttribute() {},
        appendChild() {},
        set innerHTML(value) {
          this.textContent = String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        },
        textContent: ""
      };
    }
  };
  const events = [];
  const fetchUrls = [];
  const window = {
    HKCinemaProviderRegistry: registryWithFixture({ fixtureOnly }),
    innerWidth: 390,
    addEventListener() {},
    dispatchEvent(event) { events.push(event); }
  };
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() {}
  }
  const fetch = async url => {
    const text = String(url);
    fetchUrls.push(text);
    if (!text.includes("/api/fixture/movies/fixture-movie-1/shows")) {
      throw new Error(`unexpected provider request: ${text}`);
    }
    return {
      ok: true,
      status: 200,
      async json() {
        const session = fixtureShowtime();
        return {
          ok: true,
          data: {
            availableDates: ["2026-08-15"],
            selectedDate: "2026-08-15",
            sessions: [session],
            allSessions: [session]
          },
          meta: { updatedAt: "2026-08-13T00:00:00.000Z" }
        };
      }
    };
  };
  const context = vm.createContext({
    AbortController,
    Array,
    CSS: { escape: value => String(value) },
    CustomEvent,
    Date,
    document,
    fetch,
    Intl,
    Map,
    Math,
    MutationObserver,
    Node: { ELEMENT_NODE: 1 },
    Number,
    Object,
    Set,
    String,
    URL,
    clearTimeout,
    console,
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    queueMicrotask,
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    window
  });
  return { context, window, document, content, overlay, events, fetchUrls };
}

async function load(context, ...paths) {
  for (const path of paths) {
    vm.runInContext(await source(path), context, { filename: path });
  }
}

async function settle(turns = 24) {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

test("M7R5 one fourth-provider fixture crosses catalogue, home aggregate, comparison, filters and seat capability gates", async () => {
  const harness = createHarness();
  const { context, window, content, fetchUrls } = harness;

  await load(
    context,
    "app/provider-contract.js",
    "app/provider-shared-core.js",
    "app/showtime-metadata.js",
    "app/view-models.js",
    "app/seatmap-shared.js"
  );

  const catalogue = { now: [fixtureMovie()], coming: [], festival: [] };
  assert.equal(window.HKCinemaProviderSharedCore.publishCatalogue("fixture", catalogue, { publisher: "m7r5-fixture" }), true);
  assert.equal(window.HKCinemaProviderSharedCore.catalogue("fixture"), catalogue);

  await load(context, "app/phase8a-movie-navigation.js");
  const card = homeCard();
  const aggregate = window.HKCinemaMovieAggregates.forCard(card);

  assert.ok(aggregate);
  assert.equal(aggregate.providerCount, 1);
  assert.deepEqual(Array.from(aggregate.sources.fixture), ["fixture-movie-1"]);
  assert.deepEqual(Array.from(aggregate.sources.broadway), []);
  assert.equal(aggregate.facts.classification, "IIB");
  assert.equal(aggregate.facts.durationMinutes, 123);
  assert.equal(aggregate.facts.releaseDate, "2026-08-15");

  const match = window.HKCinemaProviderMatches.get(aggregate.id);
  assert.equal(match.fixture.provider, "fixture");
  assert.equal(match.fixture.sourceId, "fixture-movie-1");
  assert.equal(match.broadway, null);

  await load(context, "app/provider-compare-v4.js");
  assert.equal(window.HKCinemaProviderCompare.open(aggregate.id), true);
  await settle();

  const compareState = window.HKCinemaProviderCompare.getState();
  assert.deepEqual(Array.from(compareState.sourceIds.fixture), ["fixture-movie-1"]);
  assert.deepEqual(Array.from(compareState.sourceIds.broadway), []);
  assert.equal(compareState.selectedDate, "2026-08-15");
  assert.equal(compareState.errors.fixture, null);
  assert.ok(fetchUrls.length >= 1);
  assert.equal(fetchUrls.every(url => url.includes("/api/fixture/")), true);
  assert.equal(fetchUrls.some(url => url.includes("/api/broadway/")), false);
  assert.match(content.innerHTML, /data-provider="fixture"/);
  assert.match(content.innerHTML, /Fixture Cinema/);
  assert.match(content.innerHTML, /data-price-capability="unsupported"/);
  assert.match(content.innerHTML, /data-seat-capability="unsupported"/);
  assert.match(content.innerHTML, /data-booking-capability="available"/);
  assert.match(content.innerHTML, /座位資料不提供/);
  assert.match(content.innerHTML, />不提供<\/div>/);
  assert.match(content.innerHTML, /href="https:\/\/fixture\.example\/book"/);
  assert.doesNotMatch(content.innerHTML, /MUST-NOT-BECOME-EMPEROR/);

  window.HKCinemaCinemaRegistry = {
    normalize(value) { return String(value || "").toLowerCase().replace(/\s+/g, "-"); },
    resolve(provider, cinema) {
      return { provider, canonical: cinema, region: "unknown", district: null };
    }
  };
  await load(context, "app/provider-compare-insights-v4.js");
  const filters = window.HKCinemaProviderCompareFilters;
  const parsed = filters.parseCardForTest(comparisonCard(), 0);
  assert.equal(filters.providerForCard(comparisonCard()), "fixture");
  assert.equal(parsed.provider, "fixture");
  assert.equal(parsed.providerLabel, "Fixture Cinema");
  assert.equal(parsed.cinemaMeta.provider, "fixture");
  assert.equal(filters.setFilter("provider", "fixture"), "fixture");
  assert.equal(filters.getState().provider, "fixture");

  const models = window.HKCinemaViewModels;
  const normalizedShowtime = models.showtime("fixture", fixtureShowtime());
  assert.equal(normalizedShowtime.provider.id, "fixture");
  assert.equal(normalizedShowtime.price.primary, null);
  assert.equal(normalizedShowtime.seats.quality, "unknown");
  assert.equal(normalizedShowtime.seatMap.supported, false);
  assert.equal(normalizedShowtime.bookingUrl, "https://fixture.example/book");

  assert.equal(models.seatMap("fixture", { sections: [{ seats: [] }] }, fixtureShowtime()), null);
});

test("M7R5 comparison bootstrap falls back to Provider Registry, never to a baked three-provider list", async () => {
  const harness = createHarness({ fixtureOnly: true });
  const { context, window, content, fetchUrls } = harness;
  const match = {
    id: "fixture-only-match",
    title: "Registry fallback fixture",
    fixture: { provider: "fixture", sourceId: "fixture-movie-1", movie: fixtureMovie() }
  };
  window.HKCinemaProviderMatches = new Map([[match.id, match]]);

  await load(context, "app/provider-compare-v4.js");
  assert.equal(window.HKCinemaProviderCompare.open(match.id), true);
  await settle();

  const state = window.HKCinemaProviderCompare.getState();
  assert.deepEqual(Object.keys(state.sourceIds), ["fixture"]);
  assert.deepEqual(Array.from(state.sourceIds.fixture), ["fixture-movie-1"]);
  assert.equal(state.selectedDate, "2026-08-15");
  assert.equal(fetchUrls.every(url => url.includes("/api/fixture/")), true);
  assert.match(content.innerHTML, /Fixture Cinema/);
  assert.match(content.innerHTML, /data-provider="fixture"/);
});

test("M7R5 removes the remaining fixed-three-provider bootstrap paths and isolates changed assets", async () => {
  const [compare, navigation, multiProvider, index] = await Promise.all([
    source("app/provider-compare-v4.js"),
    source("app/phase8a-movie-navigation.js"),
    source("app/multi-provider.js"),
    source("app/index.html")
  ]);

  assert.match(compare, /function registryProviders\(\)/);
  assert.match(compare, /sharedCore\?\.providers\?\.\(\) \|\| registryProviders\(\)/);
  assert.match(compare, /function timeoutForProvider\(provider\)/);
  assert.match(compare, /function posterForMatch\(match, aggregate\)/);
  assert.doesNotMatch(compare, /sharedCore\?\.providers\?\.\(\) \|\| \[\s*\{ key: "broadway"/);

  assert.match(navigation, /window\.HKCinemaProviderRegistry\?\.providers/);
  assert.match(navigation, /const HOME_BASE_PROVIDER = PROVIDERS\[0\] \|\| null/);
  assert.match(navigation, /sharedCore\?\.catalogue\?\.\(provider\)/);
  assert.doesNotMatch(navigation, /\["broadway", "mcl", "emperor"\]/);
  assert.doesNotMatch(navigation, /mcl-only-card|emperor-only-card/);
  assert.doesNotMatch(navigation, /HKCinemaMCLCatalogue|HKCinemaEmperorCatalogue/);

  assert.match(multiProvider, /const alternateProviders = PROVIDERS\.filter/);
  assert.match(multiProvider, /data-provider-sources/);
  assertAsset(index, "provider-compare-v4.js");
  assertAsset(index, "phase8a-movie-navigation.js");
});
