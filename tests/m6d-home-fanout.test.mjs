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

test("M6D home success-path provider fan-out remains five catalogue requests", async () => {
  const [app, mclStatus, emperorStatus, mclProvider, emperorProvider] = await Promise.all([
    source("app/app.js"),
    source("app/mcl-status.js"),
    source("app/emperor-status.js"),
    source("app/providers/mcl.js"),
    source("app/providers/emperor.js")
  ]);

  const broadwayLoad = functionBody(app, "async function loadMovies()", "window.HKCinemaBroadwayApp =");
  assert.equal(occurrences(broadwayLoad, /fetchMovieEndpoint\(/g), 2);
  assert.match(broadwayLoad, /fetchMovieEndpoint\("\/api\/broadway\/movies"\)/);
  assert.match(broadwayLoad, /fetchMovieEndpoint\("\/api\/broadway\/upcoming"\)/);

  const mclRefresh = functionBody(mclProvider, "async function refreshCatalogue()", "async function getCatalogue()");
  assert.equal(occurrences(mclRefresh, /fetchJsonWithRetry\(/g), 1);
  assert.match(mclRefresh, /GetNCF\.aspx\?l=1/);

  const emperorRefresh = functionBody(emperorProvider, "async function refreshCatalogue()", "async function getCatalogue()");
  assert.equal(occurrences(emperorRefresh, /fetchEndpoint\(/g), 2);
  assert.match(emperorRefresh, /fetchEndpoint\("\/api\/emperor\/movies"\)/);
  assert.match(emperorRefresh, /fetchEndpoint\("\/api\/emperor\/upcoming"\)/);

  const mclStatusLoad = functionBody(mclStatus, "async function loadMCLStatus()", "if (document.readyState");
  const emperorStatusLoad = functionBody(emperorStatus, "async function loadEmperorStatus()", "if (document.readyState");
  assert.equal(occurrences(mclStatusLoad, /provider\.refreshCatalogue\(\)/g), 1);
  assert.equal(occurrences(emperorStatusLoad, /provider\.refreshCatalogue\(\)/g), 1);
  assert.match(mclStatusLoad, /if \(refreshInFlight\)/);
  assert.match(emperorStatusLoad, /if \(refreshInFlight\)/);

  // Success path: Broadway 2 + MCL 1 + Emperor 2. MCL's second attempt is
  // failure-only retry behavior and therefore is not part of normal fan-out.
  assert.equal(2 + 1 + 2, 5);
});

test("Phase 8A aggregate decoration never invokes an async generic catalogue loader", async () => {
  let getCatalogueCalls = 0;
  const window = {
    HKCinemaProviderSharedCore: {
      providerIds() {
        return ["broadway", "mcl", "emperor", "fixture"];
      },
      normalizeSourceId(provider, value) {
        return String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
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
    addEventListener() {}
  };

  class MutationObserver {
    observe() {}
  }

  const document = {
    body: {},
    querySelectorAll() { return []; }
  };

  const context = vm.createContext({
    window,
    document,
    MutationObserver,
    requestAnimationFrame(callback) { callback(); }
  });
  vm.runInContext(await source("app/phase8a-movie-navigation.js"), context, {
    filename: "phase8a-movie-navigation.js"
  });

  const classes = new Set();
  const card = {
    dataset: {
      provider: "fixture",
      sourceId: "fixture-1",
      homeReleaseDate: "2026-08-12"
    },
    classList: {
      contains(value) { return classes.has(value); },
      add(...values) { values.forEach(value => classes.add(value)); }
    },
    querySelector(selector) {
      if (selector === ".movie-info h3" || selector === "h3") return { textContent: "Fixture Movie" };
      return null;
    },
    setAttribute() {},
    hasAttribute() { return false; },
    tabIndex: -1
  };

  const aggregate = window.HKCinemaMovieAggregates.forCard(card);
  assert.equal(getCatalogueCalls, 0);
  assert.equal(aggregate.providerCount, 1);
  assert.equal(aggregate.facts.releaseDate, "2026-08-12");
});

test("generic provider synchronous catalogue snapshots can enrich facts without network fan-out", async () => {
  let getCatalogueCalls = 0;
  const window = {
    HKCinemaProviderSharedCore: {
      providerIds() {
        return ["broadway", "mcl", "emperor", "fixture"];
      },
      normalizeSourceId(provider, value) {
        return String(value || "").replace(new RegExp(`^${provider}:`), "").trim();
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
    addEventListener() {}
  };

  class MutationObserver {
    observe() {}
  }
  const document = { body: {}, querySelectorAll() { return []; } };
  const context = vm.createContext({
    window,
    document,
    MutationObserver,
    requestAnimationFrame(callback) { callback(); }
  });
  vm.runInContext(await source("app/phase8a-movie-navigation.js"), context, {
    filename: "phase8a-movie-navigation.js"
  });

  const card = {
    dataset: { provider: "fixture", sourceId: "fixture-2" },
    classList: { contains() { return false; }, add() {} },
    querySelector(selector) {
      if (selector === ".movie-info h3" || selector === "h3") return { textContent: "Fixture Snapshot Movie" };
      return null;
    },
    setAttribute() {},
    hasAttribute() { return false; },
    tabIndex: -1
  };

  const aggregate = window.HKCinemaMovieAggregates.forCard(card);
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
