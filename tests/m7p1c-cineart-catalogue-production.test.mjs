import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createCineArtCatalogueService } from "../worker/src/providers/cineart-catalogue.js";

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

test("M7P1C production catalogue reuses the Worker snapshot, returns catalogue only and caches the normalized result", async () => {
  const home = await fixture("cineart-home-flight.html");
  const cache = memoryCache();
  let fetchCalls = 0;
  const service = createCineArtCatalogueService({
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

  const network = await service.get();
  assert.equal(network.meta.cacheState, "network");
  assert.equal(network.now.length, 1);
  assert.equal(network.coming.length, 1);
  assert.equal(network.festival.length, 0);
  assert.equal(network.now[0].provider, "cineart");
  assert.equal("sessions" in network, false);
  assert.equal("cinemas" in network, false);

  const cached = await service.get();
  assert.equal(cached.meta.cacheState, "fresh-edge");
  assert.equal(fetchCalls, 1);
});

test("M7P1C catalogue capability remains registered when the next staged capability is enabled", async () => {
  const registrySource = await source("app/provider-registry.js");
  const window = {};
  vm.runInNewContext(registrySource, { window, Map, Object, String });
  const registry = window.HKCinemaProviderRegistry;
  const cineart = registry.get("cineart");

  assert.deepEqual(Array.from(registry.providers, provider => provider.id), [
    "broadway",
    "mcl",
    "emperor",
    "cineart"
  ]);
  assert.equal(cineart.capabilities.catalogue, true);
  assert.equal(cineart.capabilities.prices, false);
  assert.equal(cineart.capabilities.seatSummary, false);
  assert.equal(cineart.capabilities.seatMap, false);
  assert.equal(cineart.capabilities.booking, false);
});

test("M7P1C browser adapter continues to call only the catalogue Worker route", async () => {
  const adapterSource = await source("app/providers/cineart.js");
  const calls = [];
  const catalogue = {
    now: [{ provider: "cineart", sourceId: "799", title: { zh: "測試電影" } }],
    coming: [],
    festival: [],
    meta: { updatedAt: "2026-08-13T00:00:00.000Z" }
  };
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
        data: catalogue,
        meta: {
          phase: "M7P1C",
          cacheState: "network",
          stale: false,
          updatedAt: "2026-08-13T00:00:00.000Z"
        }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    },
    Response
  });

  vm.runInContext(adapterSource, context, { filename: "app/providers/cineart.js" });
  const adapter = window.HKCinemaProviders.cineart;
  const result = await adapter.refreshCatalogue();
  assert.equal(result.now.length, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/cineart\/catalogue$/);
  assert.equal(calls[0].options.method, "GET");
  assert.doesNotMatch(calls[0].url, /\/movies\/|\/shows\/|\/seats/);
  assert.equal(adapter.comparison, undefined);
});

test("M7P1C shared catalogue publication remains observer-free after staged showtime enablement", async () => {
  const [index, status, adapter, router] = await Promise.all([
    source("app/index.html"),
    source("app/cineart-status.js"),
    source("app/providers/cineart.js"),
    source("worker/src/index-emperor-seat.js")
  ]);

  const registryIndex = index.indexOf("provider-registry.js?v=");
  const healthIndex = index.indexOf("data-health.js?v=m6c-1");
  const providerIndex = index.indexOf("providers/cineart.js?v=");
  const multiIndex = index.indexOf("multi-provider.js?v=8e2-m7r2-1");
  const statusIndex = index.indexOf("cineart-status.js?v=m7p1c-1");

  assert.ok(registryIndex >= 0 && registryIndex < healthIndex);
  assert.ok(providerIndex > healthIndex);
  assert.ok(statusIndex > multiIndex);
  assert.match(status, /HKCinemaProviderSharedCore\?\.publishCatalogue\?\.\("cineart"/);
  assert.doesNotMatch(status, /MutationObserver|IntersectionObserver|hkcinema:cineart-catalogue/);
  assert.doesNotMatch(adapter, /cinearthouse\.com\.hk/);
  assert.match(router, /\/api\/cineart\/catalogue/);
  assert.doesNotMatch(router, /\/api\/cineart\/.*seats/);
});
