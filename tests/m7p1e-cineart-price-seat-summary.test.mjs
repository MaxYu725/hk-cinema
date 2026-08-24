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
    async put(request, response) { store.set(request.url, response.clone()); }
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

test("M7P1E historical coarse mode publishes base/face price plus not-sold summary without strict detail", async () => {
  const home = await fixture("cineart-home-flight.html");
  let fetchCalls = 0;
  const service = createCineArtShowtimeService({
    cache: memoryCache(),
    now: () => NOW_MS,
    detailEnrichment: false,
    fetchImpl: async url => {
      fetchCalls += 1;
      assert.equal(String(url), "https://cinearthouse.com.hk/hk");
      return new Response(home, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
  });
  const result = await service.getMovie("799");
  assert.equal(fetchCalls, 1);
  assert.equal(result.allSessions.length, 1);
  const session = result.allSessions[0];
  assert.deepEqual(session.price, {
    currency: "HKD", display: 110, face: 110, updatedAt: "2026-08-13T00:00:00.000Z"
  });
  assert.deepEqual(session.seatSummary, {
    quality: "coarse-not-sold", total: 4, available: null, held: null, sold: 1,
    blocked: null, unavailable: 1, notSold: 3, upstreamSeatsHold: 1,
    updatedAt: "2026-08-13T00:00:00.000Z"
  });
  assert.equal(session.bookingUrl, "https://cinearthouse.com.hk/hk/show/9001");
  assert.equal("seatStates" in session, false);
  assert.equal("seatPlan" in session, false);
  assert.equal("ticketTypes" in session, false);
});

test("M7P1E historical coarse mode does not coerce missing price or seat evidence into zero", async () => {
  const sourceHome = await fixture("cineart-home-flight.html");
  const home = sourceHome.replace(
    '\\"price\\":110,\\"seats\\":4,\\"seatsHold\\":1,\\"sold\\":1,\\"avaliable\\":3',
    '\\"price\\":null,\\"seats\\":null,\\"seatsHold\\":null,\\"sold\\":null,\\"avaliable\\":null'
  );
  assert.notEqual(home, sourceHome, "fixture mutation must replace the show inventory fields");
  const service = createCineArtShowtimeService({
    cache: memoryCache(),
    now: () => NOW_MS,
    detailEnrichment: false,
    fetchImpl: async () => new Response(home, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })
  });
  const session = (await service.getMovie("799")).allSessions[0];
  assert.equal(session.price, null);
  if (session.seatSummary) {
    assert.equal(session.seatSummary.total, null);
    assert.equal(session.seatSummary.sold, null);
    assert.equal(session.seatSummary.notSold, null);
    assert.equal(session.seatSummary.upstreamSeatsHold, null);
  }
});

test("M7P1E prices and seatSummary remain enabled while later optional capabilities may advance independently", async () => {
  const registrySource = await source("app/provider-registry.js");
  const window = {};
  vm.runInNewContext(registrySource, { window, Map, Object, String });
  const cineart = window.HKCinemaProviderRegistry.get("cineart");
  assert.equal(cineart.capabilities.catalogue, true);
  assert.equal(cineart.capabilities.showtimes, true);
  assert.equal(cineart.capabilities.prices, true);
  assert.equal(cineart.capabilities.seatSummary, true);
  assert.equal(cineart.capabilities.booking, true);
});

test("M7P1E CineArt comparison normalizer still labels coarse seats as not-sold, never selectable", async () => {
  const adapterSource = await source("app/providers/cineart.js");
  const window = {};
  vm.runInNewContext(adapterSource, {
    AbortController, Date, Error, JSON, Map, Math, Object, Set, String, clearTimeout,
    localStorage: localStorageStub(), setTimeout, window,
    fetch: async () => { throw new Error("network must not be used by normalizeSession"); }
  });
  const adapter = window.HKCinemaProviders.cineart;
  assert.equal(adapter.comparison.fetchShows, undefined);
  const item = adapter.comparison.normalizeSession({
    sourceId: "9001", movieSourceId: "799", time: "19:30",
    cinema: { name: { zh: "影藝戲院" } }, house: { name: "1院" },
    languages: ["粵語"], subtitles: ["中文字幕"], formats: [],
    price: { currency: "HKD", display: 110, face: 110 },
    seatSummary: { quality: "coarse-not-sold", total: 4, available: null, held: null, sold: 1, notSold: 3, upstreamSeatsHold: 1 },
    bookingUrl: null
  });
  assert.equal(item.price, 110);
  assert.equal(item.pricePayload.display, 110);
  assert.equal(item.seatText, "3/4 未售（未核實可選）");
  assert.equal(item.seatAvailable, null);
  assert.equal(item.seatTotal, 4);
  assert.equal(item.seatClass, "unknown");
  assert.equal(item.bookingUrl, null);
  assert.doesNotMatch(item.seatText, /^\d+\/\d+ 可選$/);
  assert.doesNotMatch(adapterSource, /MutationObserver|IntersectionObserver|cinearthouse\.com\.hk/);
});

test("M7P1E coarse snapshot boundary remains available beneath later selected-date detail stages", async () => {
  const [showtimes, manifest, index, checkpoint] = await Promise.all([
    source("worker/src/providers/cineart-showtimes.js"), source("worker/src/provider-manifest.js"),
    source("app/index.html"), source("docs/checkpoints/m7p1e-cineart-price-seat-summary.md")
  ]);
  assert.match(showtimes, /function publicSeatSummary/);
  assert.match(showtimes, /quality:\s*"coarse-not-sold"/);
  assert.match(showtimes, /available:\s*null/);
  assert.match(showtimes, /held:\s*null/);
  assert.match(showtimes, /buildCineArtSessionBookingUrl/);
  assert.match(manifest, /cineart/);
  assert.ok(index.indexOf("providers/cineart.js") >= 0);
  assert.match(checkpoint, /M7P1E checkpoint/i);
  assert.match(checkpoint, /coarse-not-sold/);
});

test("M7P1E started only after M7P1D Android installed-PWA acceptance passed", async () => {
  const checkpoint = await source("docs/checkpoints/m7p1d-cineart-showtimes-production.md");
  assert.match(checkpoint, /## Android installed-PWA acceptance/i);
  assert.match(checkpoint, /\*\*PASS\.\*\*/i);
  assert.match(checkpoint, /This PASS is the release gate permitting M7P1E to begin/i);
});
