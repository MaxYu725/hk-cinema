import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createCineArtShowtimeService } from "../worker/src/providers/cineart-showtimes.js";
import { assertAsset } from "./index-assets.mjs";

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

test("M7P1F enriches only selected-date CineArt sessions with detailed price and strict A/H/U/L summary", async () => {
  const [home, show] = await Promise.all([
    fixture("cineart-home-flight.html"),
    fixture("cineart-show-flight.html")
  ]);
  const cache = memoryCache();
  const calls = [];
  const service = createCineArtShowtimeService({
    cache,
    now: () => NOW_MS,
    fetchImpl: async url => {
      const value = String(url);
      calls.push(value);
      if (value === "https://cinearthouse.com.hk/hk") {
        return new Response(home, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (value === "https://cinearthouse.com.hk/hk/show/9001") {
        return new Response(show, { status: 200, headers: { "content-type": "text/html" } });
      }
      throw new Error(`unexpected URL ${value}`);
    }
  });

  const result = await service.getMovie("799");
  assert.equal(calls.length, 2);
  assert.equal(result.selectedDate, "2026-08-13");
  assert.equal(result.sessions.length, 1);
  assert.equal(result.allSessions.length, 1);

  const selected = result.sessions[0];
  assert.deepEqual(selected.price, {
    currency: "HKD",
    display: 110,
    adult: 110,
    student: 95,
    child: null,
    senior: null,
    face: 110,
    lowest: 95,
    ticketTypes: [
      { name: "成人 Adult", price: 110, concession: false },
      { name: "學生 Student", price: 95, concession: true }
    ],
    updatedAt: "2026-08-13T00:00:00.000Z"
  });
  assert.deepEqual(selected.seatSummary, {
    quality: "strict-seat-state",
    total: 4,
    available: 1,
    held: 1,
    sold: 1,
    blocked: 1,
    unavailable: 3,
    unknown: 0,
    updatedAt: "2026-08-13T00:00:00.000Z"
  });
  assert.equal(selected.bookingUrl, null);
  assert.equal("seatStates" in selected, false);
  assert.equal("seatPlan" in selected, false);

  const coarse = result.allSessions[0];
  assert.equal(coarse.price.display, 110);
  assert.equal("adult" in coarse.price, false);
  assert.equal(coarse.seatSummary.quality, "coarse-not-sold");
  assert.equal(coarse.seatSummary.available, null);
  assert.equal(result.meta.detail.attempted, 1);
  assert.equal(result.meta.detail.detailedPrices, 1);
  assert.equal(result.meta.detail.strictSeats, 1);

  await service.getMovie("799");
  assert.equal(calls.length, 2, "home and strict detail should both reuse Worker cache");
});

test("M7P1F detail failure degrades to M7P1E coarse evidence instead of failing the comparison", async () => {
  const home = await fixture("cineart-home-flight.html");
  const service = createCineArtShowtimeService({
    cache: memoryCache(),
    now: () => NOW_MS,
    fetchImpl: async url => {
      if (String(url) === "https://cinearthouse.com.hk/hk") {
        return new Response(home, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("blocked", { status: 503 });
    }
  });

  const result = await service.getMovie("799");
  const selected = result.sessions[0];
  assert.equal(selected.price.display, 110);
  assert.equal("adult" in selected.price, false);
  assert.equal(selected.seatSummary.quality, "coarse-not-sold");
  assert.equal(selected.seatSummary.available, null);
  assert.equal(result.meta.detail.attempted, 1);
  assert.equal(result.meta.detail.strictSeats, 0);
  assert.equal(result.meta.detail.fallback, 1);
});

test("M7P1F browser normalizer renders strict CineArt seats as selectable while preserving coarse wording fallback", async () => {
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
    Set,
    String,
    clearTimeout,
    localStorage: localStorageStub(),
    setTimeout,
    window,
    fetch: async () => { throw new Error("normalizer must not perform network IO"); }
  });

  const adapter = window.HKCinemaProviders.cineart;
  assert.equal(adapter.comparison.fetchShows, undefined);
  const strict = adapter.comparison.normalizeSession({
    sourceId: "9001",
    movieSourceId: "799",
    time: "19:30",
    cinema: { name: { zh: "影藝戲院" } },
    house: { name: "1院" },
    languages: ["粵語"],
    subtitles: ["中文字幕"],
    formats: [],
    price: { currency: "HKD", display: 110, adult: 110, student: 95, face: 110 },
    seatSummary: {
      quality: "strict-seat-state",
      total: 4,
      available: 1,
      held: 1,
      sold: 1,
      blocked: 1,
      unavailable: 3,
      unknown: 0
    },
    bookingUrl: null
  });

  assert.equal(strict.price, 110);
  assert.equal(strict.seatText, "1/4 可選");
  assert.equal(strict.seatAvailable, 1);
  assert.equal(strict.seatTotal, 4);
  assert.equal(strict.seatClass, "limited");
  assert.equal(strict.bookingUrl, null);

  const coarse = adapter.comparison.normalizeSession({
    sourceId: "9002",
    movieSourceId: "799",
    time: "21:30",
    cinema: { name: { zh: "影藝戲院" } },
    price: { currency: "HKD", display: 110, face: 110 },
    seatSummary: { quality: "coarse-not-sold", total: 4, available: null, held: null, sold: 1, notSold: 3 }
  });
  assert.equal(coarse.seatText, "3/4 未售（非可選數）");
  assert.equal(coarse.seatAvailable, null);
  assert.equal(coarse.seatClass, "unknown");
});

test("M7P1F public showtime boundary remains seat-map-free after M7P1G enables a separate read-only seat-map capability", async () => {
  const [registrySource, adapterSource, showtimesSource, router, manifest, index, checkpoint] = await Promise.all([
    source("app/provider-registry.js"),
    source("app/providers/cineart.js"),
    source("worker/src/providers/cineart-showtimes.js"),
    source("worker/src/index-emperor-seat.js"),
    source("worker/src/provider-manifest.js"),
    source("app/index.html"),
    source("docs/checkpoints/m7p1f-cineart-strict-detail.md")
  ]);
  const window = {};
  vm.runInNewContext(registrySource, { window, Map, Object, String });
  const cineart = window.HKCinemaProviderRegistry.get("cineart");

  assert.equal(cineart.capabilities.prices, true);
  assert.equal(cineart.capabilities.seatSummary, true);
  assert.equal(cineart.capabilities.booking, false);
  assert.match(router, /phase:\s*"M7P1F"/);
  assert.match(router, /showtimes-detailed-price-strict-seats-selected-date/);
  assert.match(showtimesSource, /selected-date-bounded/);
  assert.match(showtimesSource, /DEFAULT_DETAIL_CONCURRENCY\s*=\s*3/);
  assert.match(showtimesSource, /DEFAULT_DETAIL_LIMIT\s*=\s*6/);
  assert.doesNotMatch(showtimesSource, /seatStates\s*:/);
  assert.doesNotMatch(showtimesSource, /seatPlan\s*:/);
  assert.doesNotMatch(adapterSource, /MutationObserver|IntersectionObserver|cinearthouse\.com\.hk/);
  assert.match(manifest, /catalogue-showtimes-detailed-price-strict-seats-seatmap-production-readonly/);
  assertAsset(index, "providers/cineart.js");
  assert.match(checkpoint, /seatMap:\s*false/);
  assert.match(checkpoint, /booking:\s*false/);
});

test("M7P1F begins only after M7P1E Android installed-PWA acceptance passed", async () => {
  const checkpoint = await source("docs/checkpoints/m7p1f-cineart-strict-detail.md");
  assert.match(checkpoint, /M7P1E Android installed-PWA acceptance:\s*\*\*PASS\*\*/i);
  assert.match(checkpoint, /release gate permitting M7P1F/i);
});
