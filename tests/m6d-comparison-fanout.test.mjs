import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

function mainCacheContext({ nativeFetch, mclGetTicketing = null } = {}) {
  const document = {
    addEventListener() {}
  };
  const window = {
    location: { href: "https://maxyu725.github.io/hk-cinema/" },
    fetch: nativeFetch || (async () => new Response("{}", { status: 200 })),
    HKCinemaProviderRegistry: {
      providers: [
        { id: "broadway" },
        { id: "mcl" },
        { id: "emperor" }
      ]
    },
    HKCinemaProviders: mclGetTicketing
      ? { mcl: { getTicketing: mclGetTicketing } }
      : {},
    addEventListener() {}
  };

  return {
    window,
    context: vm.createContext({
      window,
      document,
      URL,
      URLSearchParams,
      Request,
      Response,
      AbortController,
      setTimeout,
      clearTimeout
    })
  };
}

test("M6D comparison request lifecycle aborts superseded work and ignores stale responses", async () => {
  const compare = await source("app/provider-compare-v4.js");

  assert.match(compare, /function beginRequestCycle\(\)[\s\S]*abortActiveRequest\("superseded"\)[\s\S]*\+\+requestToken[\s\S]*new AbortController\(\)/);
  assert.match(compare, /function close\(\)[\s\S]*abortActiveRequest\("close"\)[\s\S]*requestToken\+\+/);
  assert.match(compare, /async function loadDate\(date, cycle = null\)[\s\S]*cycle \|\| beginRequestCycle\(\)[\s\S]*token !== requestToken \|\| signal\.aborted \|\| !state\.match \|\| state\.selectedDate !== date/);
  assert.match(compare, /async function loadInitial\(match\)[\s\S]*beginRequestCycle\(\)[\s\S]*token !== requestToken \|\| signal\.aborted \|\| state\.match\?\.id !== match\.id/);
  assert.match(compare, /fetchShows:\s*fetchMCLShows/);
  assert.match(compare, /providerAdapter\.getTicketing\(sourceId, date, \{ signal: lifecycle\.controller\.signal \}\)/);
  assert.match(compare, /comparisonAdapter\(provider\)\?\.fetchShows \|\| fetchWorkerShows/);
});

test("initial Broadway showtime response aliases its resolved date and avoids a second native fetch", async () => {
  let nativeCalls = 0;
  const nativeFetch = async () => {
    nativeCalls += 1;
    return new Response(JSON.stringify({
      ok: true,
      data: {
        availableDates: ["2026-08-12", "2026-08-13"],
        selectedDate: "2026-08-12",
        sessions: [{ sourceId: "show-1", date: "2026-08-12", time: "19:30" }]
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const { window, context } = mainCacheContext({ nativeFetch });
  vm.runInContext(await source("app/api-client.js"), context, {
    filename: "api-client.js"
  });
  vm.runInContext(await source("app/provider-compare-main-cache-v3.js"), context, {
    filename: "provider-compare-main-cache-v3.js"
  });

  const cache = window.HKCinemaProviderCompareMainCache;
  const first = await cache.getWorkerShows("broadway", "1");
  assert.equal(first.data.selectedDate, "2026-08-12");

  const second = await cache.getWorkerShows("broadway", "1", "2026-08-12");

  assert.equal(nativeCalls, 1);
  assert.equal(second.data.selectedDate, "2026-08-12");
});

test("HTTP 200 Worker application errors are evicted instead of being retained for the showtime TTL", async () => {
  let nativeCalls = 0;
  const nativeFetch = async () => {
    nativeCalls += 1;
    const payload = nativeCalls === 1
      ? { ok: false, error: { message: "temporary upstream failure" } }
      : {
          ok: true,
          data: {
            availableDates: ["2026-08-12"],
            selectedDate: "2026-08-12",
            sessions: []
          }
        };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const { window, context } = mainCacheContext({ nativeFetch });
  vm.runInContext(await source("app/api-client.js"), context, {
    filename: "api-client.js"
  });
  vm.runInContext(await source("app/provider-compare-main-cache-v3.js"), context, {
    filename: "provider-compare-main-cache-v3.js"
  });

  const cache = window.HKCinemaProviderCompareMainCache;
  await assert.rejects(
    cache.getWorkerShows("emperor", "9"),
    error => error?.message === "temporary upstream failure"
  );

  const recovered = await cache.getWorkerShows("emperor", "9");
  assert.equal(recovered.ok, true);
  assert.equal(nativeCalls, 2, "retry after an application error must reach the Worker again");

  const cached = await cache.getWorkerShows("emperor", "9");
  assert.equal(cached.ok, true);
  assert.equal(nativeCalls, 2, "successful application payload should still reuse the showtime cache");
});

test("MCL main comparison cache forwards AbortSignal and aliases complete initial result to resolved date", async () => {
  const calls = [];
  const original = async (movieSetId, selectedDate, options = {}) => {
    calls.push({ movieSetId, selectedDate, signal: options.signal || null });
    return {
      movieSetId: String(movieSetId),
      availableDates: ["2026-08-12", "2026-08-13"],
      selectedDate: selectedDate || "2026-08-12",
      sessions: [],
      allSessions: [],
      metadataComplete: true
    };
  };

  const { window, context } = mainCacheContext({ mclGetTicketing: original });
  vm.runInContext(await source("app/api-client.js"), context, {
    filename: "api-client.js"
  });
  vm.runInContext(await source("app/provider-compare-main-cache-v3.js"), context, {
    filename: "provider-compare-main-cache-v3.js"
  });

  const firstController = new AbortController();
  const first = await window.HKCinemaProviders.mcl.getTicketing(
    "123",
    null,
    { signal: firstController.signal }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal, firstController.signal);
  assert.equal(first.selectedDate, "2026-08-12");

  const secondController = new AbortController();
  const second = await window.HKCinemaProviders.mcl.getTicketing(
    "123",
    "2026-08-12",
    { signal: secondController.signal }
  );
  assert.equal(calls.length, 1, "complete resolved-date request should reuse the initial MCL primary cache entry");
  assert.equal(second.selectedDate, "2026-08-12");

  const aborted = new AbortController();
  aborted.abort("superseded");
  await assert.rejects(
    window.HKCinemaProviders.mcl.getTicketing("123", "2026-08-13", { signal: aborted.signal }),
    error => error?.name === "AbortError"
  );
  assert.equal(calls.length, 1, "aborted requests must not reach the wrapped MCL transport");
});

test("incomplete initial MCL metadata is not aliased over the explicit-date retry", async () => {
  const calls = [];
  const original = async (movieSetId, selectedDate) => {
    calls.push({ movieSetId, selectedDate });
    return {
      movieSetId: String(movieSetId),
      availableDates: ["2026-08-12"],
      selectedDate: selectedDate || "2026-08-12",
      sessions: [],
      allSessions: [],
      metadataComplete: selectedDate !== null
    };
  };

  const { window, context } = mainCacheContext({ mclGetTicketing: original });
  vm.runInContext(await source("app/api-client.js"), context, {
    filename: "api-client.js"
  });
  vm.runInContext(await source("app/provider-compare-main-cache-v3.js"), context, {
    filename: "provider-compare-main-cache-v3.js"
  });

  const initial = await window.HKCinemaProviders.mcl.getTicketing("456", null);
  assert.equal(initial.metadataComplete, false);
  assert.equal(calls.length, 1);

  const explicit = await window.HKCinemaProviders.mcl.getTicketing("456", "2026-08-12");
  assert.equal(calls.length, 2, "explicit date must retry when initial MCL metadata is incomplete");
  assert.equal(explicit.metadataComplete, true);
});

test("adjacent-date prefetch keeps an AbortController and passes its signal into the generic provider cache helper", async () => {
  const prefetch = await source("app/provider-compare-prefetch.js");

  assert.match(prefetch, /let activeController = null/);
  assert.match(prefetch, /activeController\.abort\("superseded"\)/);
  assert.match(prefetch, /runPrefetch\(context, ownGeneration, controller\.signal\)/);
  assert.match(prefetch, /providerIds\(\)\.map\(provider => \(\{/);
  assert.match(prefetch, /cache\.prefetchProvider\(entry\.provider, sourceId, date, signal\)/);
  assert.doesNotMatch(prefetch, /prefetchBroadway\(context\.broadwayId/);
  assert.doesNotMatch(prefetch, /prefetchEmperor\(context\.emperorId/);
  assert.match(prefetch, /type === "open" \|\| type === "close" \|\| type === "date-change" \|\| type === "reload"/);
});

test("comparison filters stay presentation-only and changed network helpers are cache-busted", async () => {
  const [filterUx, index] = await Promise.all([
    source("app/phase9b3-filter-compact.js"),
    source("app/index.html")
  ]);

  assert.doesNotMatch(filterUx, /\bfetch\s*\(/);
  assertAsset(index, "provider-compare-main-cache-v3.js");
  assertAsset(index, "provider-compare-prefetch.js");
});