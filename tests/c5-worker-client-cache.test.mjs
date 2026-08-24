import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { PUBLIC_CACHE_CONTROL, ROUTES, json, routeRequest } from "../worker/src/router.js";
import { assertAssetOrder } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

function loadApiClient(fetchImpl) {
  const window = { fetch: fetchImpl };
  const context = vm.createContext({
    window,
    AbortController,
    Error,
    Number,
    Object,
    String,
    URL,
    URLSearchParams,
    clearTimeout,
    setTimeout
  });
  return read("app/api-client.js").then(source => {
    vm.runInContext(source, context, { filename: "api-client.js" });
    return window.HKCinemaApiClient;
  });
}

test("C5 loads one Worker API client before every Worker-backed adapter", async () => {
  const index = await read("app/index.html");
  assertAssetOrder(index, "api-client.js", "providers/broadway.js", "providers/emperor.js");
  assertAssetOrder(index, "api-client.js", "mcl-ticketing-hybrid.js", "provider-compare-v4.js");
  assertAssetOrder(index, "api-client.js", "seatmap-shared.js", "seatmap.js");
});

test("C5 API client owns the Worker origin, JSON contract and no-store transport", async () => {
  const calls = [];
  const client = await loadApiClient(async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      ok: true,
      data: { sessions: [] },
      meta: { updatedAt: "2026-08-24T00:00:00.000Z" }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const result = await client.get("/api/fixture/movies/42/shows", {
    query: { date: "2026-08-24", ignored: null },
    timeoutMs: 0
  });
  assert.deepEqual(result.data, { sessions: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://hk-cinema-api.max-yu-jp.workers.dev/api/fixture/movies/42/shows?date=2026-08-24");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.headers.Accept, "application/json");
  assert.equal(client.cacheOwners.showtimes, "provider-compare-main-cache");
  assert.equal(client.cacheOwners.seatMap, "seatmap-shared");
});

test("C5 Worker consumers no longer hard-code the Worker origin or replace window.fetch", async () => {
  const apiClient = await read("app/api-client.js");
  const consumers = await Promise.all([
    "providers/broadway.js",
    "providers/emperor.js",
    "providers/cineart.js",
    "mcl-ticketing-hybrid.js",
    "provider-compare-main-cache-v3.js",
    "provider-compare-v4.js",
    "provider-compare-seats.js",
    "seatmap.js",
    "mcl-seatmap.js",
    "emperor-seatmap.js",
    "cineart-seatmap.js"
  ].map(path => read(`app/${path}`)));

  assert.match(apiClient, /hk-cinema-api\.max-yu-jp\.workers\.dev/);
  for (const source of consumers) {
    assert.doesNotMatch(source, /hk-cinema-api\.max-yu-jp\.workers\.dev/);
    assert.doesNotMatch(source, /window\.fetch\s*=/);
  }
  assert.match(consumers[9], /hkcinema:comparison-store-change/);
  assert.match(consumers[9], /HKCinemaComparisonStore/);
});

test("C5 deploys one route table and keeps compatibility entry files logic-free", async () => {
  const [wrangler, index, emperorShim, seatShim] = await Promise.all([
    read("worker/wrangler.jsonc"),
    read("worker/src/index.js"),
    read("worker/src/index-emperor.js"),
    read("worker/src/index-emperor-seat.js")
  ]);
  assert.match(wrangler, /"main": "src\/index\.js"/);
  assert.match(index, /routeRequest/);
  assert.equal(emperorShim.trim(), 'export { default } from "./index.js";');
  assert.equal(seatShim.trim(), 'export { default } from "./index.js";');

  const ids = ROUTES.map(route => route.id);
  for (const id of [
    "health",
    "broadway-catalogue-current",
    "mcl-ticketing",
    "emperor-showtimes",
    "cineart-catalogue",
    "cineart-seatmap",
    "providers-probe-all"
  ]) assert.ok(ids.includes(id), `missing route ${id}`);
  assert.equal(new Set(ids).size, ids.length);
});

test("C5 route table preserves every production URL with one matching owner", () => {
  const cases = new Map([
    ["/health", "health"],
    ["/api/providers/probe", "providers-probe-all"],
    ["/api/providers/probe/cineart", "providers-probe-one"],
    ["/api/broadway/movies", "broadway-catalogue-current"],
    ["/api/broadway/upcoming", "broadway-catalogue-upcoming"],
    ["/api/broadway/movies/42/shows", "broadway-showtimes"],
    ["/api/broadway/shows/84/seats", "broadway-seatmap"],
    ["/api/mcl/ticketing", "mcl-ticketing"],
    ["/api/mcl/shows/84/seats", "mcl-seatmap"],
    ["/api/emperor/movies", "emperor-catalogue-current"],
    ["/api/emperor/upcoming", "emperor-catalogue-upcoming"],
    ["/api/emperor/movies/film_42/shows", "emperor-showtimes"],
    ["/api/emperor/shows/84/seats", "emperor-seatmap"],
    ["/api/cineart/catalogue", "cineart-catalogue"],
    ["/api/cineart/movies/42/shows", "cineart-showtimes"],
    ["/api/cineart/shows/84/seats", "cineart-seatmap"],
    ["/api/providers/cineart/discovery", "cineart-discovery"]
  ]);
  for (const [pathname, expected] of cases) {
    const url = new URL(pathname, "https://example.test");
    const matches = ROUTES.filter(route => route.match(url));
    assert.deepEqual(matches.map(route => route.id), [expected], pathname);
  }
});

test("C5 public Worker responses are no-store while service caches remain explicit owners", async () => {
  assert.equal(PUBLIC_CACHE_CONTROL, "no-store");
  const forced = json({ ok: true }, 200, { "cache-control": "public, max-age=999" });
  assert.equal(forced.headers.get("cache-control"), "no-store");

  const health = await routeRequest(new Request("https://example.test/health"), {
    CF_VERSION_METADATA: { id: "v1" }
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  const payload = await health.json();
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.cacheOwners.catalogue, "provider-adapter");
  assert.equal(payload.cacheOwners.showtimes, "comparison-service");
  assert.equal(payload.cacheOwners.seatMap, "seat-map-service");

  const method = await routeRequest(new Request("https://example.test/health", { method: "POST" }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET");
  assert.equal(method.headers.get("cache-control"), "no-store");
});

test("C5 rotates the controlled shell cache without claiming live cinema requests", async () => {
  const sw = await read("app/sw.js");
  assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}\$\{SHELL_MANIFEST\.version\}`/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
  assert.doesNotMatch(sw, /hk-cinema-api\.max-yu-jp\.workers\.dev/);
});
