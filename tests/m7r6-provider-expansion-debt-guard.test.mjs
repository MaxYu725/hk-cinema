import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

const providerIds = ["broadway", "mcl", "emperor", "fixture"];
const descriptors = providerIds.map(id => ({
  id,
  displayName: id === "fixture" ? "Fixture Cinema" : id
}));

function sharedCore() {
  return {
    providerIds: () => [...providerIds],
    providers: () => descriptors.map(descriptor => ({
      key: descriptor.id,
      label: descriptor.displayName,
      descriptor
    })),
    registeredProviderId(value) {
      const key = String(value || "").trim().toLowerCase();
      return providerIds.includes(key) ? key : null;
    },
    normalizeSourceId(provider, value) {
      return String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
    },
    aggregateSourceIds(aggregate, provider) {
      return (aggregate?.sources?.[provider] || []).map(value =>
        String(value || "").replace(new RegExp(`^${provider}:`), "").trim()
      ).filter(Boolean);
    },
    activeProvidersForAggregate(aggregate) {
      return this.providers().filter(provider => (aggregate?.sources?.[provider.key] || []).length);
    }
  };
}

function basicDocument() {
  return {
    hidden: false,
    body: {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

test("M7R6 comparison cache allocates and prefetches a registered fourth provider", async () => {
  const requests = [];
  const core = sharedCore();
  const window = {
    location: { href: "https://example.test/" },
    HKCinemaProviderRegistry: { providers: descriptors },
    HKCinemaProviderSharedCore: core,
    HKCinemaProviders: {},
    addEventListener() {},
    fetch: async input => {
      const url = String(input);
      requests.push(url);
      return new Response(JSON.stringify({
        ok: true,
        data: {
          availableDates: ["2026-08-13"],
          selectedDate: "2026-08-13",
          sessions: []
        },
        meta: { updatedAt: "2026-08-13T00:00:00.000Z" }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  };
  const context = vm.createContext({
    AbortController,
    Request,
    Response,
    URL,
    console,
    document: basicDocument(),
    setTimeout,
    clearTimeout,
    window
  });

  vm.runInContext(await read("app/api-client.js"), context, {
    filename: "api-client.js"
  });
  vm.runInContext(await read("app/provider-compare-main-cache-v3.js"), context, {
    filename: "provider-compare-main-cache-v3.js"
  });

  const cache = window.HKCinemaProviderCompareMainCache;
  assert.ok(cache.getStats().providers.fixture);
  assert.equal(await cache.prefetchProvider("fixture", "fixture:movie-1", "2026-08-13"), true);
  assert.ok(requests.some(url => /\/api\/fixture\/movies\/movie-1\/shows\?date=2026-08-13$/.test(url)));
  assert.ok(cache.getStats().providers.fixture.entries >= 1);
  assert.equal(cache.clearProvider("fixture"), true);
  assert.equal(cache.getStats().providers.fixture.entries, 0);
});

test("M7R6 adjacent-date prefetch context includes a registered fourth provider", async () => {
  const core = sharedCore();
  const overlay = {
    hidden: false,
    querySelector(selector) {
      if (selector === "#providerCompareContent") return { querySelector() { return null; } };
      return null;
    }
  };
  const document = basicDocument();
  document.querySelector = selector => selector === "#providerCompareOverlay" ? overlay : null;

  const window = {
    HKCinemaProviderRegistry: { providers: descriptors },
    HKCinemaProviderSharedCore: core,
    HKCinemaMovieAggregates: { get() { return null; } },
    HKCinemaProviderCompareMainCache: { prefetchProvider() { return Promise.resolve(true); } },
    HKCinemaProviderCompare: {
      getState() {
        return {
          selectedDate: "2026-08-13",
          match: {
            id: "fixture-match",
            broadway: { sourceId: "broadway:1" },
            fixture: { sourceId: "fixture:9" }
          },
          availableDates: {
            broadway: ["2026-08-12", "2026-08-13"],
            fixture: ["2026-08-13", "2026-08-14"]
          }
        };
      }
    },
    addEventListener() {}
  };

  class MutationObserver {
    observe() {}
  }

  const context = vm.createContext({
    AbortController,
    MutationObserver,
    document,
    navigator: {},
    queueMicrotask,
    setTimeout,
    clearTimeout,
    window
  });
  vm.runInContext(await read("app/provider-compare-prefetch.js"), context, {
    filename: "provider-compare-prefetch.js"
  });

  const model = window.HKCinemaProviderComparePrefetch.getContext();
  assert.deepEqual(Array.from(model.targets), ["2026-08-12", "2026-08-14"]);
  assert.deepEqual(
    Array.from(model.providers, entry => entry.provider),
    ["broadway", "fixture"]
  );
  assert.deepEqual(Array.from(model.providers[1].sourceIds), ["9"]);
});

test("M7R6 resilience includes and retries a registered fourth provider", async () => {
  const core = sharedCore();
  const cleared = [];
  const opened = [];
  const window = {
    HKCinemaProviderRegistry: { providers: descriptors },
    HKCinemaProviderSharedCore: core,
    HKCinemaProviderCompareMainCache: { clearProvider(provider) { cleared.push(provider); } },
    HKCinemaProviderCompare: {
      getState() { return { match: { id: "fixture-match", fixture: { sourceId: "fixture:9" } } }; },
      open(id) { opened.push(id); }
    },
    addEventListener() {}
  };
  const document = basicDocument();
  class MutationObserver {
    observe() {}
  }
  const context = vm.createContext({
    CustomEvent: class CustomEvent {},
    MutationObserver,
    Node: { ELEMENT_NODE: 1 },
    document,
    requestAnimationFrame() {},
    window
  });

  vm.runInContext(await read("app/provider-compare-resilience-v3.js"), context, {
    filename: "provider-compare-resilience-v3.js"
  });

  const api = window.HKCinemaProviderCompareResilience;
  const active = api.activeProviders({ match: { fixture: { sourceId: "fixture:9" } } });
  assert.deepEqual(Array.from(active, entry => entry.key), ["fixture"]);
  api.retryProvider("fixture");
  assert.deepEqual(cleared, ["fixture"]);
  assert.deepEqual(opened, ["fixture-match"]);
});

test("M7R6 cinema registry never falls an unknown provider back to Broadway", async () => {
  const window = {};
  vm.runInContext(await read("app/cinema-registry.js"), vm.createContext({ window }), {
    filename: "cinema-registry.js"
  });
  const result = window.HKCinemaCinemaRegistry.resolve("fixture", "Fixture Harbour Cinema");
  assert.equal(result.provider, "fixture");
  assert.equal(result.region, "unknown");
});

test("M7R6 shared owners contain no old three-provider universe/event gates", async () => {
  const [cache, prefetch, resilience, metro, domain, renderer, cinema] = await Promise.all([
    read("app/provider-compare-main-cache-v3.js"),
    read("app/provider-compare-prefetch.js"),
    read("app/provider-compare-resilience-v3.js"),
    read("app/metro-runtime.js"),
    read("app/catalogue-domain.js"),
    read("app/multi-provider.js"),
    read("app/cinema-registry.js")
  ]);

  assert.doesNotMatch(prefetch, /broadwayDates|mclDates|emperorDates|broadwayId|mclId|emperorId/);
  assert.doesNotMatch(resilience, /const\s+PROVIDERS\s*=\s*\[\s*\{\s*key:\s*["']broadway/);
  assert.match(cache, /prefetchProvider/);
  assert.match(cache, /`\/api\/\$\{key\}\/movies\/\$\{encodeURIComponent\(id\)\}\/shows`/);
  assert.doesNotMatch(metro, /hkcinema:mcl-catalogue|hkcinema:emperor-catalogue/);
  assert.match(metro, /hkcinema:provider-catalogue/);
  assert.doesNotMatch(`${domain}\n${renderer}`, /hkcinema:mcl-catalogue|hkcinema:emperor-catalogue/);
  assert.match(renderer, /hkcinema:catalogue-store/);
  assert.doesNotMatch(cinema, /provider\s*===\s*["']mcl["']\s*\?\s*["']mcl["']\s*:\s*["']broadway["']/);
});
