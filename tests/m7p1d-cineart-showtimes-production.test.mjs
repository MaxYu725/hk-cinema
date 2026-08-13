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

test("M7P1D historical showtime mode remains home-snapshot backed and cacheable beneath later detail stages", async () => {
  const home = await fixture("cineart-home-flight.html");
  const cache = memoryCache();
  let fetchCalls = 0;
  const service = createCineArtShowtimeService({
    cache,
    now: () => NOW_MS,
    detailEnrichment: false,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(home, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
  });
  const first = await service.getMovie("799");
  assert.equal(first.meta.cacheState, "network");
  assert.ok(first.availableDates.length > 0);
  assert.equal(first.allSessions.length, 1);
  assert.equal(first.sessions.length, 1);
  assert.equal(first.sessions[0].provider, "cineart");
  assert.equal(first.sessions[0].movieSourceId, "799");
  assert.equal(first.sessions[0].sourceId, "9001");
  assert.equal(first.sessions[0].bookingUrl, null);
  assert.equal("seatStates" in first.sessions[0], false);
  assert.equal("seatPlan" in first.sessions[0], false);
  assert.equal("ticketTypes" in first.sessions[0], false);
  const selectedDate = first.availableDates[0];
  const cached = await service.getMovie("799", selectedDate);
  assert.equal(cached.meta.cacheState, "fresh-edge");
  assert.equal(cached.selectedDate, selectedDate);
  assert.equal(cached.sessions.every(session => session.date === selectedDate), true);
  assert.equal(fetchCalls, 1);
  await assert.rejects(() => service.getMovie("not-a-movie"), error => error?.code === "CINEART_SHOWTIMES_INVALID_MOVIE" && error?.status === 400);
  await assert.rejects(() => service.getMovie("799", "13-08-2026"), error => error?.code === "CINEART_SHOWTIMES_INVALID_DATE" && error?.status === 400);
});

test("M7P1D catalogue/showtimes remain enabled while later optional capabilities may advance independently", async () => {
  const registrySource = await source("app/provider-registry.js");
  const window = {};
  vm.runInNewContext(registrySource, { window, Map, Object, String });
  const cineart = window.HKCinemaProviderRegistry.get("cineart");
  assert.equal(cineart.capabilities.catalogue, true);
  assert.equal(cineart.capabilities.showtimes, true);
  assert.equal(cineart.capabilities.booking, false);
});

test("M7P1D shared showtime transport remains the network owner after later CineArt normalizers", async () => {
  const [adapterSource, compareSource, index] = await Promise.all([
    source("app/providers/cineart.js"), source("app/provider-compare-v4.js"), source("app/index.html")
  ]);
  const calls = [];
  const window = {};
  const context = vm.createContext({
    AbortController, Date, Error, JSON, Map, Math, Object, Set, String, clearTimeout,
    localStorage: localStorageStub(), setTimeout, window,
    fetch: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        ok: true,
        data: { now: [{ provider: "cineart", sourceId: "799", title: { zh: "測試電影" } }], coming: [], festival: [], meta: { updatedAt: "2026-08-13T00:00:00.000Z" } },
        meta: { phase: "M7P1C", cacheState: "network", stale: false, updatedAt: "2026-08-13T00:00:00.000Z" }
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    Response
  });
  vm.runInContext(adapterSource, context, { filename: "app/providers/cineart.js" });
  const adapter = window.HKCinemaProviders.cineart;
  await adapter.refreshCatalogue();
  assert.equal(adapter.comparison?.fetchShows, undefined);
  assert.equal(typeof adapter.comparison?.normalizeSession, "function");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/cineart\/catalogue$/);
  assert.doesNotMatch(adapterSource, /cinearthouse\.com\.hk|MutationObserver|IntersectionObserver/);
  assert.match(compareSource, /\/api\/\$\{provider\}\/movies\/\$\{encodeURIComponent\(sourceId\)\}\/shows/);
  assert.match(compareSource, /comparisonAdapter\(provider\)\?\.fetchShows \|\| fetchWorkerShows/);
  assert.ok(index.indexOf("provider-registry.js?v=") >= 0);
  assert.ok(index.indexOf("providers/cineart.js?v=") >= 0);
});

test("M7P1D public showtime route remains GET-only while later Worker stages may enrich selected-date detail internally", async () => {
  const [router, showtimes, manifest, checkpoint] = await Promise.all([
    source("worker/src/index-emperor-seat.js"), source("worker/src/providers/cineart-showtimes.js"),
    source("worker/src/provider-manifest.js"), source("docs/checkpoints/m7p1d-cineart-showtimes-production.md")
  ]);
  assert.match(router, /const cineArtShowsMatch = url\.pathname\.match/);
  assert.match(router, /cineArtShowtimeService\.getMovie/);
  assert.match(router, /CineArt showtimes are read-only/);
  assert.match(showtimes, /getCineArtWorkerSnapshot/);
  assert.match(showtimes, /bookingUrl:\s*null/);
  assert.match(manifest, /catalogue-showtimes/);
  assert.match(checkpoint, /M7P1D/);
  assert.match(checkpoint, /did not request individual `\/hk\/show\/<showId>` detail pages/i);
});

test("M7P1D discovery revalidation treats per-show seat-map geometry as diagnostic", async () => {
  const validation = await source("scripts/m7p1b-cineart-preview-validation.mjs");
  const requiredBlock = validation.match(/const requiredCapabilities = \[([\s\S]*?)\];/)?.[1] || "";
  assert.doesNotMatch(requiredBlock, /seatMapReadOnly/);
  assert.match(validation, /seatMapCapabilityKnown = typeof result\?\.capabilities\?\.seatMapReadOnly === "boolean"/);
  assert.match(validation, /!seatMapCapabilityKnown/);
});

test("M7P1D checkpoint records its original capability boundary and Android installed-PWA acceptance", async () => {
  const checkpoint = await source("docs/checkpoints/m7p1d-cineart-showtimes-production.md");
  assert.match(checkpoint, /Status: \*\*COMPLETE/i);
  assert.match(checkpoint, /Android installed-PWA.*PASS/i);
  assert.match(checkpoint, /showtimes:\s*true/);
  assert.match(checkpoint, /prices:\s*false/);
  assert.match(checkpoint, /seatSummary:\s*false/);
  assert.match(checkpoint, /seatMap:\s*false/);
  assert.match(checkpoint, /booking:\s*false/);
});
