import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  createProviderManifest,
  providerHealthMap
} from "../worker/src/provider-manifest.js";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

const PROVIDER_IDS = Object.freeze([
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel"
]);

function descriptors({ seatMapProvider = null } = {}) {
  return PROVIDER_IDS.map((id, index) => Object.freeze({
    id,
    displayName: `Cinema ${index + 1}`,
    healthLabel: `C${index + 1}`,
    capabilities: Object.freeze({
      catalogue: true,
      showtimes: true,
      prices: false,
      seatSummary: false,
      seatMap: id === seatMapProvider,
      booking: true
    })
  }));
}

function registry(options = {}) {
  const providers = Object.freeze(descriptors(options));
  const byId = new Map(providers.map(provider => [provider.id, provider]));
  return Object.freeze({
    providers,
    get(id) {
      return byId.get(String(id || "").trim().toLowerCase()) || null;
    },
    hasCapability(id, capability) {
      return Boolean(this.get(id)?.capabilities?.[capability]);
    }
  });
}

function customEventClass() {
  return class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
}

async function load(context, ...paths) {
  for (const path of paths) {
    vm.runInContext(await source(path), context, { filename: path });
  }
}

async function settle(turns = 36) {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

test("M7R7 shared provider core scales catalogue state and maps to eight registered providers", async () => {
  const events = [];
  const window = {
    HKCinemaProviderRegistry: registry(),
    dispatchEvent(event) { events.push(event); }
  };
  const context = vm.createContext({
    CustomEvent: customEventClass(),
    Map,
    Object,
    Set,
    String,
    window
  });

  await load(context, "app/provider-shared-core.js");
  const core = window.HKCinemaProviderSharedCore;

  assert.equal(core.providerIds().length, 8);
  assert.deepEqual(Array.from(core.providerIds()), PROVIDER_IDS);
  assert.deepEqual(Object.keys(core.providerMap(() => null)), PROVIDER_IDS);
  assert.equal(core.allProviderLabel(8), "8 院線");

  for (const id of PROVIDER_IDS) {
    const catalogue = { now: [{ provider: id, sourceId: `${id}-movie` }], coming: [] };
    assert.equal(core.publishCatalogue(id, catalogue, { test: "m7r7" }), true);
    assert.equal(core.catalogue(id), catalogue);
  }

  assert.deepEqual(Object.keys(core.catalogueMap()), PROVIDER_IDS);
  assert.equal(events.filter(event => event.type === "hkcinema:provider-catalogue").length, 8);
});

test("M7R7 comparison loads and renders eight providers without fixed provider-name branches", async () => {
  const content = { innerHTML: "" };
  const overlay = {
    hidden: true,
    querySelector(selector) {
      return selector === "#providerCompareContent" ? content : null;
    }
  };
  const bodyClasses = new Set();
  const document = {
    body: {
      classList: {
        add(...values) { values.forEach(value => bodyClasses.add(value)); },
        remove(...values) { values.forEach(value => bodyClasses.delete(value)); }
      },
      appendChild() {}
    },
    addEventListener() {},
    querySelector(selector) {
      return selector === "#providerCompareOverlay" ? overlay : null;
    },
    createElement() { throw new Error("existing overlay should be reused"); }
  };
  const match = { id: "eight-provider-match", title: "Eight Provider Stress" };
  for (const id of PROVIDER_IDS) {
    match[id] = { provider: id, sourceId: `${id}-movie` };
  }

  const fetchUrls = [];
  const fetch = async input => {
    const url = String(input);
    fetchUrls.push(url);
    const provider = url.match(/\/api\/([^/]+)\/movies\//)?.[1] || null;
    assert.ok(PROVIDER_IDS.includes(provider), `unexpected provider URL: ${url}`);
    const session = {
      id: `${provider}:session`,
      sourceId: "session",
      date: "2026-08-20",
      time: "19:30",
      cinema: { id: `${provider}-cinema`, name: { zh: `${provider} 戲院` } },
      house: { name: "House 1" },
      bookingUrl: `https://${provider}.example/book`
    };
    return new Response(JSON.stringify({
      ok: true,
      data: {
        availableDates: ["2026-08-20"],
        selectedDate: "2026-08-20",
        sessions: [session],
        allSessions: [session]
      },
      meta: { updatedAt: "2026-08-13T00:00:00.000Z" }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const window = {
    HKCinemaProviderRegistry: registry(),
    HKCinemaProviderMatches: new Map([[match.id, match]]),
    HKCinemaProviders: {},
    addEventListener() {},
    dispatchEvent() {}
  };
  const context = vm.createContext({
    AbortController,
    CustomEvent: customEventClass(),
    Date,
    document,
    fetch,
    Intl,
    Map,
    Math,
    Number,
    Object,
    Response,
    Set,
    String,
    URL,
    clearTimeout,
    setTimeout,
    window
  });

  await load(context, "app/provider-compare-v4.js");
  assert.equal(window.HKCinemaProviderCompare.open(match.id), true);
  await settle();

  const state = window.HKCinemaProviderCompare.getState();
  assert.deepEqual(Object.keys(state.sourceIds), PROVIDER_IDS);
  for (const id of PROVIDER_IDS) {
    assert.deepEqual(Array.from(state.sourceIds[id]), [`${id}-movie`]);
    assert.equal(state.errors[id], null);
  }
  assert.equal(state.selectedDate, "2026-08-20");
  assert.equal(new Set(fetchUrls.map(url => url.match(/\/api\/([^/]+)\/movies\//)?.[1])).size, 8);
  assert.match(content.innerHTML, /8 院線/);
  for (let index = 1; index <= 8; index += 1) {
    assert.match(content.innerHTML, new RegExp(`Cinema ${index}`));
  }
  assert.equal(fetchUrls.some(url => /\/api\/(broadway|mcl|emperor)\//.test(url)), false);
});

test("M7R7 comparison accepts a future provider transport hook without editing shared dispatch", async () => {
  const future = Object.freeze({
    id: "future",
    displayName: "Future Cinema",
    healthLabel: "Future",
    capabilities: Object.freeze({ catalogue: true, showtimes: true, prices: false, seatSummary: false, seatMap: false, booking: true })
  });
  const futureRegistry = Object.freeze({
    providers: Object.freeze([future]),
    get(id) { return String(id || "").toLowerCase() === "future" ? future : null; }
  });
  const match = {
    id: "future-match",
    title: "Future Adapter",
    future: { provider: "future", sourceId: "movie-1" }
  };
  const content = { innerHTML: "" };
  const overlay = { hidden: true, querySelector() { return content; } };
  const calls = [];
  const document = {
    body: { classList: { add() {}, remove() {} }, appendChild() {} },
    addEventListener() {},
    querySelector(selector) { return selector === "#providerCompareOverlay" ? overlay : null; },
    createElement() { throw new Error("overlay should exist"); }
  };
  const window = {
    HKCinemaProviderRegistry: futureRegistry,
    HKCinemaProviderMatches: new Map([[match.id, match]]),
    HKCinemaProviders: {
      future: {
        comparison: {
          async fetchShows(provider, sourceId, date) {
            calls.push({ provider, sourceId, date });
            return {
              availableDates: ["2026-08-21"],
              selectedDate: date || "2026-08-21",
              sessions: [{ sourceId: "future-session", date: "2026-08-21", time: "20:00", bookingUrl: "https://future.example/book" }],
              allSessions: []
            };
          }
        }
      }
    },
    addEventListener() {},
    dispatchEvent() {}
  };
  let nativeFetchCalls = 0;
  const context = vm.createContext({
    AbortController,
    CustomEvent: customEventClass(),
    Date,
    document,
    fetch: async () => { nativeFetchCalls += 1; throw new Error("generic Worker transport should not run"); },
    Intl,
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    URL,
    clearTimeout,
    setTimeout,
    window
  });

  await load(context, "app/provider-compare-v4.js");
  window.HKCinemaProviderCompare.open(match.id);
  await settle();

  assert.equal(nativeFetchCalls, 0);
  assert.ok(calls.length >= 1);
  assert.equal(calls.every(call => call.provider === "future"), true);
  assert.equal(window.HKCinemaProviderCompare.getState().errors.future, null);
});

test("M7R7 comparison cache allocates independent buckets for eight providers with dynamic diagnostics", async () => {
  const requests = [];
  const window = {
    location: { href: "https://example.test/" },
    HKCinemaProviderRegistry: registry(),
    HKCinemaProviders: {},
    addEventListener() {},
    fetch: async input => {
      requests.push(String(input));
      return new Response(JSON.stringify({
        ok: true,
        data: {
          availableDates: ["2026-08-20"],
          selectedDate: "2026-08-20",
          sessions: []
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  };
  const document = { addEventListener() {} };
  const context = vm.createContext({
    AbortController,
    Request,
    Response,
    URL,
    clearTimeout,
    document,
    setTimeout,
    window
  });

  await load(context, "app/provider-compare-main-cache-v3.js");
  const cache = window.HKCinemaProviderCompareMainCache;
  assert.deepEqual(Object.keys(cache.getStats().providers), PROVIDER_IDS);
  assert.equal("broadwayEntries" in cache.getStats(), false);
  assert.equal("mclEntries" in cache.getStats(), false);
  assert.equal("emperorEntries" in cache.getStats(), false);

  for (const id of PROVIDER_IDS) {
    assert.equal(await cache.prefetchProvider(id, `${id}:movie`, "2026-08-20"), true);
  }
  assert.equal(new Set(requests.map(url => url.match(/\/api\/([^/]+)\/movies\//)?.[1])).size, 8);
  for (const id of PROVIDER_IDS) {
    assert.ok(cache.getStats().providers[id].entries >= 1);
  }
  assert.equal(cache.clearProvider("hotel"), true);
  assert.equal(cache.getStats().providers.hotel.entries, 0);
  assert.ok(cache.getStats().providers.alpha.entries >= 1);
});

test("M7R7 future seat-map capability resolves through an adapter hook instead of a provider-name conditional", async () => {
  const window = {
    HKCinemaProviderRegistry: registry({ seatMapProvider: "hotel" }),
    HKCinemaProviders: {
      hotel: {
        seatMapRequest(providerId, session) {
          return {
            supported: true,
            layoutMode: "grid",
            request: { showId: `${providerId}:${session.sourceId}` },
            reason: null
          };
        }
      }
    }
  };
  const context = vm.createContext({
    Array,
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    window
  });

  await load(context, "app/view-models.js");
  const showtime = window.HKCinemaViewModels.showtime("hotel", {
    sourceId: "session-8",
    date: "2026-08-20",
    time: "21:00",
    cinema: { id: "hotel-cinema", name: "Hotel Cinema" }
  });

  assert.equal(showtime.provider.id, "hotel");
  assert.equal(showtime.seatMap.supported, true);
  assert.equal(showtime.seatMap.layoutMode, "grid");
  assert.equal(showtime.seatMap.request.showId, "hotel:session-8");
});

test("M7R7 Worker provider manifest and health payload scale to eight providers without fixed columns", () => {
  const manifest = createProviderManifest(PROVIDER_IDS.map(id => ({
    id,
    service: `${id}-service`
  })));
  const health = providerHealthMap(manifest);

  assert.equal(manifest.length, 8);
  assert.deepEqual(Object.keys(health), PROVIDER_IDS);
  assert.equal(health.hotel, "hotel-service");
  assert.throws(
    () => createProviderManifest([{ id: "dup" }, { id: "dup" }]),
    /duplicate provider ids/
  );
});

test("M7R7 zero-base static guard rejects shared three-provider dispatch and fixed Worker health schema", async () => {
  const [compare, viewModels, cache, worker, manifest, index] = await Promise.all([
    source("app/provider-compare-v4.js"),
    source("app/view-models.js"),
    source("app/provider-compare-main-cache-v3.js"),
    source("worker/src/index.js"),
    source("worker/src/provider-manifest.js"),
    source("app/index.html")
  ]);

  assert.match(compare, /const COMPARISON_ADAPTERS = Object\.freeze/);
  assert.match(compare, /window\.HKCinemaProviders\?\.\[provider\]\?\.comparison/);
  assert.doesNotMatch(compare, /if \(provider === ["'](?:broadway|mcl|emperor)["']\)/);
  assert.doesNotMatch(compare, /if \(provider !== ["']mcl["']\)/);

  assert.match(viewModels, /const SEAT_MAP_REQUEST_BUILDERS = Object\.freeze/);
  assert.doesNotMatch(viewModels, /if \(providerId === ["'](?:broadway|mcl|emperor)["']\)/);

  assert.match(cache, /const CACHE_ADAPTERS = Object\.freeze/);
  assert.doesNotMatch(cache, /broadwayEntries|mclEntries|emperorEntries/);

  assert.match(worker, /providers: providerHealthMap\(\)/);
  assert.doesNotMatch(worker, /providers:\s*\{\s*broadway:/);
  assert.match(manifest, /createProviderManifest/);
  assert.match(manifest, /WORKER_PROVIDER_IDS/);

  for (const asset of ["provider-compare-main-cache-v3.js", "provider-compare-v4.js", "view-models.js"]) {
    assertAsset(index, asset);
  }
});
