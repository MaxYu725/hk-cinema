import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

function functionBody(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `${startMarker} must exist`);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return text.slice(start, end);
}

function occurrences(text, pattern) {
  return (text.match(pattern) || []).length;
}

test("C3 home success-path provider fan-out remains six bounded catalogue requests", async () => {
  const [broadwayProvider, broadwayStatus, mclStatus, emperorStatus, cineartStatus, mclProvider, emperorProvider, cineartProvider] = await Promise.all([
    source("app/providers/broadway.js"),
    source("app/broadway-status.js"),
    source("app/mcl-status.js"),
    source("app/emperor-status.js"),
    source("app/cineart-status.js"),
    source("app/providers/mcl.js"),
    source("app/providers/emperor.js"),
    source("app/providers/cineart.js")
  ]);

  const broadwayRefresh = functionBody(broadwayProvider, "async function refreshCatalogue()", "window.HKCinemaProviders =");
  assert.equal(occurrences(broadwayRefresh, /fetchEndpoint\(/g), 2);
  assert.match(broadwayRefresh, /fetchEndpoint\("\/api\/broadway\/movies"\)/);
  assert.match(broadwayRefresh, /fetchEndpoint\("\/api\/broadway\/upcoming"\)/);

  const mclRefresh = functionBody(mclProvider, "async function refreshCatalogue()", "async function getCatalogue()");
  assert.equal(occurrences(mclRefresh, /fetchJsonWithRetry\(/g), 1);
  assert.match(mclRefresh, /GetNCF\.aspx\?l=1/);

  const emperorRefresh = functionBody(emperorProvider, "async function refreshCatalogue()", "async function getCatalogue()");
  assert.equal(occurrences(emperorRefresh, /fetchEndpoint\(/g), 2);
  assert.match(emperorRefresh, /fetchEndpoint\("\/api\/emperor\/movies"\)/);
  assert.match(emperorRefresh, /fetchEndpoint\("\/api\/emperor\/upcoming"\)/);

  const mclStatusLoad = functionBody(mclStatus, "async function loadMCLStatus()", "if (document.readyState");
  const emperorStatusLoad = functionBody(emperorStatus, "async function loadEmperorStatus()", "if (document.readyState");
  const broadwayStatusLoad = functionBody(broadwayStatus, "async function loadBroadwayCatalogue()", "if (document.readyState");
  const cineartStatusLoad = functionBody(cineartStatus, "async function loadCineArtCatalogue()", "if (document.readyState");
  const cineartRefresh = functionBody(cineartProvider, "async function refreshCatalogue()", "async function getCatalogue()");
  assert.equal(occurrences(mclStatusLoad, /provider\.refreshCatalogue\(\)/g), 1);
  assert.equal(occurrences(emperorStatusLoad, /provider\.refreshCatalogue\(\)/g), 1);
  assert.equal(occurrences(broadwayStatusLoad, /provider\.refreshCatalogue\(\)/g), 1);
  assert.equal(occurrences(cineartStatusLoad, /provider\.refreshCatalogue\(\)/g), 1);
  assert.equal(occurrences(cineartRefresh, /HKCinemaApiClient\?\.get\?\.\(/g), 1);
  assert.match(broadwayStatusLoad, /if \(refreshInFlight\)/);
  assert.match(mclStatusLoad, /if \(refreshInFlight\)/);
  assert.match(emperorStatusLoad, /if \(refreshInFlight\)/);
  assert.match(cineartStatusLoad, /if \(refreshInFlight\)/);

  // Success path: Broadway 2 + MCL 1 + Emperor 2 + CineArt 1. MCL's second attempt is
  // failure-only retry behavior and therefore is not part of normal fan-out.
  assert.equal(2 + 1 + 2 + 1, 6);
});

test("catalogue domain never invokes an async provider catalogue loader", async () => {
  let getCatalogueCalls = 0;
  const providers = [{ id: "fixture", displayName: "Fixture Cinema", capabilities: {} }];
  const window = {
    HKCinemaProviderRegistry: {
      providers,
      get(id) {
        return providers.find(provider => provider.id === String(id || "").toLowerCase()) || null;
      }
    },
    HKCinemaProviders: {
      fixture: {
        getCatalogue() {
          getCatalogueCalls += 1;
          return Promise.resolve({
            now: [{ sourceId: "fixture-1", rating: "IIB", durationMinutes: 101 }],
            coming: []
          });
        }
      }
    },
    addEventListener() {},
    dispatchEvent() {}
  };
  const context = vm.createContext({ window });
  for (const path of [
    "app/catalogue-store.js",
    "app/provider-shared-core.js",
    "app/home-discovery-core.js",
    "app/showtime-metadata.js",
    "app/catalogue-domain.js"
  ]) vm.runInContext(await source(path), context, { filename: path });
  window.HKCinemaCatalogueStore.publish("fixture", {
    now: [{ sourceId: "fixture-1", title: { zh: "Fixture Movie" }, releaseDate: "2026-08-12" }],
    coming: []
  });
  const aggregate = window.HKCinemaCatalogueDomain.build("now").aggregates[0];
  assert.equal(getCatalogueCalls, 0);
  assert.equal(aggregate.providerCount, 1);
  assert.equal(aggregate.facts.releaseDate, "2026-08-12");
});

test("only the canonical catalogue store can enrich aggregate facts", async () => {
  let getCatalogueCalls = 0;
  const providers = [{ id: "fixture", displayName: "Fixture Cinema", capabilities: {} }];
  const window = {
    HKCinemaProviderRegistry: {
      providers,
      get(id) {
        return providers.find(provider => provider.id === String(id || "").toLowerCase()) || null;
      }
    },
    HKCinemaProviders: {
      fixture: {
        catalogue: {
          now: [{
            sourceId: "fixture-2",
            rating: "IIA",
            durationMinutes: 109,
            releaseDate: "2026-08-13"
          }],
          coming: []
        },
        getCatalogue() {
          getCatalogueCalls += 1;
          return Promise.resolve(null);
        }
      }
    },
    addEventListener() {},
    dispatchEvent() {}
  };
  const context = vm.createContext({ window });
  for (const path of [
    "app/catalogue-store.js",
    "app/provider-shared-core.js",
    "app/home-discovery-core.js",
    "app/showtime-metadata.js",
    "app/catalogue-domain.js"
  ]) vm.runInContext(await source(path), context, { filename: path });
  assert.equal(window.HKCinemaCatalogueDomain.build("now").aggregates.length, 0);
  window.HKCinemaCatalogueStore.publish("fixture", {
    now: [{
      sourceId: "fixture-2",
      title: { zh: "Fixture Snapshot Movie" },
      rating: "IIA",
      durationMinutes: 109,
      releaseDate: "2026-08-13"
    }],
    coming: []
  });
  const aggregate = window.HKCinemaCatalogueDomain.build("now").aggregates[0];
  assert.equal(getCatalogueCalls, 0);
  assert.deepEqual(
    {
      classification: aggregate.facts.classification,
      durationMinutes: aggregate.facts.durationMinutes,
      releaseDate: aggregate.facts.releaseDate
    },
    { classification: "IIA", durationMinutes: 109, releaseDate: "2026-08-13" }
  );
});

test("live cinema data remains outside the Service Worker shell cache", async () => {
  const [sw, index] = await Promise.all([
    source("app/sw.js"),
    source("app/index.html")
  ]);

  assert.match(sw, /if \(url\.origin !== self\.location\.origin \|\| !url\.pathname\.startsWith\(SCOPE_URL\.pathname\)\) \{[\s\S]*return;/);
  assert.match(sw, /Cinema APIs, MCL, Worker and all other live data stay outside the PWA cache/);
  assertAsset(index, "phase8a-movie-navigation.js");
});
