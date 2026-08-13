import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createCineArtShowtimeService } from "../worker/src/providers/cineart-showtimes.js";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");
const fixture = name => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const NOW_MS = Date.parse("2026-08-13T00:00:00.000Z");

function memoryCache() {
  const store = new Map();
  return {
    async match(request) {
      const response = store.get(request.url);
      return response ? response.clone() : null;
    },
    async put(request, response) {
      store.set(request.url, response.clone());
    }
  };
}

function localStorageStub() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("M7P1E Worker publishes base/face price plus coarse not-sold summary without strict seat detail", async () => {
  const home = await fixture("cineart-home-flight.html");
  let fetchCalls = 0;
  const service = createCineArtShowtimeService({
    cache: memoryCache(),
    now: () => NOW_MS,
    fetchImpl: async url => {
      fetchCalls += 1;
      assert.equal(String(url), "https://cinearthouse.com.hk/hk");
      return new Response(home, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
  });

  const result = await service.getMovie("799");
  assert.equal(fetchCalls, 1);
  assert.equal(result.allSessions.length, 1);
  const session = result.allSessions[0];

  assert.deepEqual(session.price, {
    currency: "HKD",
    display: 110,
    face: 110,
    updatedAt: "2026-08-13T00:00:00.000Z"
  });
  assert.deepEqual(session.seatSummary, {
    quality: "coarse-not-sold",
    total: 4,
    available: null,
    held: null,
    sold: 1,
    blocked: null,
    unavailable: 1,
    notSold: 3,
    upstreamSeatsHold: 1,
    updatedAt: "2026-08-13T00:00:00.000Z"
  });
  assert.equal(session.bookingUrl, null);
  assert.equal("seatStates" in session, false);
  assert.equal("seatPlan" in session, false);
  assert.equal("ticketTypes" in session, false);
});

test("M7P1E Browser Registry enables CineArt prices and seatSummary but not seatMap or booking", async () => {
  const registrySource = await source("app/provider-registry.js");
  const window = {};
  vm.runInNewContext(registrySource, { window, Map, Object, String });
  const registry = window.HKCinemaProviderRegistry;
  const cineart = registry.get("cineart");

  assert.equal(registry.version, "m7p1e-1");
  assert.deepEqual({ ...cineart.capabilities }, {
    catalogue: true,
    showtimes: true,
    prices: true,
    seatSummary: true,
    seatMap: false,
    booking: false
  });
});

test("M7P1E CineArt comparison normalizer labels coarse seats as not-sold, never selectable", async () => {
  const adapterSource = await source("app/providers/cineart.js");
  const window = {};
  vm.runInNewContext(adapterSource, {
    AbortController,
    Date,
    Error,
    JSON,
    Map,
    Math,
    Object,
    String,
    clearTimeout,
    localStorage: localStorageStub(),
    setTimeout,
    window,
    fetch: async () => { throw new Error("network must not be used by normalizeSession"); }
  });

  const adapter = window.HKCinemaProviders.cineart;
  assert.equal(adapter.comparison.fetchShows, undefined);
  const item = adapter.comparison.normalizeSession({
    sourceId: "9001",
    movieSourceId: "799",
    time: "19:30",
    cinema: { name: { zh: "影藝戲院" } },
    house: { name: "1院" },
    languages: ["粵語"],
    subtitles: ["中文字幕"],
    formats: [],
    price: { currency: "HKD", display: 110, face: 110 },
    seatSummary: {
      quality: "coarse-not-sold",
      total: 4,
      available: null,
      held: null,
      sold: 1,
      notSold: 3,
      upstreamSeatsHold: 1
    },
    bookingUrl: null
  });

  assert.equal(item.price, 110);
  assert.equal(item.pricePayload.display, 110);
  assert.equal(item.seatText, "3/4 未售（非可選數）");
  assert.equal(item.seatAvailable, null);
  assert.equal(item.seatTotal, 4);
  assert.equal(item.seatClass, "unknown");
  assert.equal(item.bookingUrl, null);
  assert.doesNotMatch(item.seatText, /可選(?!數)/);
  assert.doesNotMatch(adapterSource, /MutationObserver|IntersectionObserver|cinearthouse\.com\.hk/);
});

test("M7P1E route advertises the staged mode and keeps detail/booking boundaries closed", async () => {
  const [router, showtimes, manifest, index] = await Promise.all([
    source("worker/src/index-emperor-seat.js"),
    source("worker/src/providers/cineart-showtimes.js"),
    source("worker/src/provider-manifest.js"),
    source("app/index.html")
  ]);

  assert.match(router, /phase:\s*"M7P1E"/);
  assert.match(router, /mode:\s*"showtimes-base-price-coarse-seats"/);
  assert.match(showtimes, /m7p1e\/cineart\/showtimes/);
  assert.match(showtimes, /quality:\s*"coarse-not-sold"/);
  assert.match(showtimes, /available:\s*null/);
  assert.match(showtimes, /held:\s*null/);
  assert.match(showtimes, /bookingUrl:\s*null/);
  assert.doesNotMatch(showtimes, /\/show\/|ticketPrice|seatStatus|seatPlan/);
  assert.match(manifest, /catalogue-showtimes-price-coarse-seats-production-detail-candidate-readonly/);
  assert.ok(index.indexOf("provider-registry.js?v=m7p1e-1") >= 0);
  assert.ok(index.indexOf("providers/cineart.js?v=m7p1e-1") >= 0);
});

test("M7P1E starts only after M7P1D Android installed-PWA acceptance passed", async () => {
  const checkpoint = await source("docs/checkpoints/m7p1d-cineart-showtimes-production.md");
  assert.match(checkpoint, /Android installed-PWA acceptance[\s\S]*?\*\*PASS\*\*/i);
  assert.match(checkpoint, /This PASS is the release gate permitting M7P1E to begin/i);
});
