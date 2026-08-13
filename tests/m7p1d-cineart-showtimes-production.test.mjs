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

test("M7P1D Worker showtime service publishes scheduling only and reuses its bounded home snapshot cache", async () => {
  const home = await fixture("cineart-home-flight.html");
  const cache = memoryCache();
  let fetchCalls = 0;
  const service = createCineArtShowtimeService({
    cache,
    now: () => NOW_MS,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(home, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      });
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
  assert.equal(first.sessions[0].price, null);
  assert.equal(first.sessions[0].seatSummary, null);
  assert.equal(first.sessions[0].bookingUrl, null);
  assert.equal("seatStates" in first.sessions[0], false);
  assert.equal("seatPlan" in first.sessions[0], false);

  const selectedDate = first.availableDates[0];
  const cached = await service.getMovie("799", selectedDate);
  assert.equal(cached.meta.cacheState, "fresh-edge");
  assert.equal(cached.selectedDate, selectedDate);
  assert.equal(cached.sessions.every(session => session.date === selectedDate), true);
  assert.equal(fetchCalls, 1);

  await assert.rejects(
    () => service.getMovie("not-a-movie"),
    error => error?.code === "CINEART_SHOWTIMES_INVALID_MOVIE" && error?.status === 400
  );
  await assert.rejects(
    () => service.getMovie("799", "13-08-2026"),
    error => error?.code === "CINEART_SHOWTIMES_INVALID_DATE" && error?.status === 400
  );
});

test("M7P1D Browser Registry enables CineArt showtimes while price, seat and booking capabilities remain off", async () => {
  const registrySource = await source("app/provider-registry.js");
  const window = {};
  vm.runInNewContext(registrySource, { window, Map, Object, String });
  const registry = window.HKCinemaProviderRegistry;
  const cineart = registry.get("cineart");

  assert.equal(registry.version, "m7p1d-1");
  assert.deepEqual({ ...cineart.capabilities }, {
    catalogue: true,
    showtimes: true,
    prices: false,
    seatSummary: false,
    seatMap: false,
    booking: false
  });
});

test("M7P1D CineArt browser adapter keeps catalogue ownership only and delegates showtimes to the shared generic transport", async () => {
  const [adapterSource, compareSource, index] = await Promise.all([
    source("app/providers/cineart.js"),
    source("app/provider-compare-v4.js"),
    source("app/index.html")
  ]);
  const calls = [];
  const window = {};
  const context = vm.createContext({
    AbortController,
    Date,
    Error,
    JSON,
    Map,
    Object,
    String,
    clearTimeout,
    localStorage: localStorageStub(),
    setTimeout,
    window,
    fetch: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({
        ok: true,
        data: {
          now: [{ provider: "cineart", sourceId: "799", title: { zh: "測試電影" } }],
          coming: [],
          festival: [],
          meta: { updatedAt: "2026-08-13T00:00:00.000Z" }
        },
        meta: {
          phase: "M7P1C",
          cacheState: "network",
          stale: false,
          updatedAt: "2026-08-13T00:00:00.000Z"
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    Response
  });

  vm.runInContext(adapterSource, context, { filename: "app/providers/cineart.js" });
  const adapter = window.HKCinemaProviders.cineart;
  await adapter.refreshCatalogue();

  assert.equal(adapter.comparison, undefined);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/cineart\/catalogue$/);
  assert.doesNotMatch(adapterSource, /cinearthouse\.com\.hk|MutationObserver|IntersectionObserver/);
  assert.match(compareSource, /\/api\/\$\{provider\}\/movies\/\$\{encodeURIComponent\(sourceId\)\}\/shows/);
  assert.match(compareSource, /comparisonAdapter\(provider\)\?\.fetchShows \|\| fetchWorkerShows/);
  assert.ok(index.indexOf("provider-registry.js?v=m7p1d-1") >= 0);
  assert.ok(index.indexOf("providers/cineart.js?v=m7p1d-1") >= 0);
});

test("M7P1D Worker route is GET-only and exposes no detailed price, seat or booking implementation", async () => {
  const [router, showtimes, manifest] = await Promise.all([
    source("worker/src/index-emperor-seat.js"),
    source("worker/src/providers/cineart-showtimes.js"),
    source("worker/src/provider-manifest.js")
  ]);

  assert.match(router, /\/api\/cineart\\\/movies\\\/\(\\d\+\)\\\/shows/);
  assert.match(router, /phase:\s*"M7P1D"/);
  assert.match(router, /mode:\s*"showtimes-only"/);
  assert.match(router, /CineArt showtimes are read-only/);
  assert.match(showtimes, /price:\s*null/);
  assert.match(showtimes, /seatSummary:\s*null/);
  assert.match(showtimes, /bookingUrl:\s*null/);
  assert.doesNotMatch(showtimes, /\/show\/|ticketPrice|seatStatus|seatPlan/);
  assert.match(manifest, /catalogue-showtimes-production-detail-candidate-readonly/);
});

test("M7P1D starts only after the M7P1C Android installed-PWA freeze gate passed", async () => {
  const [previous, checkpoint] = await Promise.all([
    source("docs/checkpoints/m7p1c-cineart-catalogue-production.md"),
    source("docs/checkpoints/m7p1d-cineart-showtimes-production.md")
  ]);

  assert.match(previous, /Android installed-PWA.*PASS/i);
  assert.match(previous, /cold launch.*normal|cold launch.*正常/i);
  assert.match(previous, /reopen.*normal|reopen.*正常/i);
  assert.match(checkpoint, /showtimes:\s*true/);
  assert.match(checkpoint, /prices:\s*false/);
  assert.match(checkpoint, /seatSummary:\s*false/);
  assert.match(checkpoint, /seatMap:\s*false/);
  assert.match(checkpoint, /booking:\s*false/);
});
