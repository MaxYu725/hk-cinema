import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
  assert.match(compare, /mcl\.getTicketing\(sourceId, date, \{ signal: lifecycle\.controller\.signal \}\)/);
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
  vm.runInContext(await source("app/provider-compare-main-cache-v3.js"), context, {
    filename: "provider-compare-main-cache-v3.js"
  });

  const initialUrl = "https://hk-cinema-api.max-yu-jp.workers.dev/api/broadway/movies/1/shows";
  const dateUrl = `${initialUrl}?date=2026-08-12`;

  const first = await window.fetch(initialUrl, { cache: "no-store" });
  await first.text();
  await new Promise(resolve => setTimeout(resolve, 0));

  const second = await window.fetch(dateUrl, { cache: "no-store" });
  const body = await second.json();

  assert.equal(nativeCalls, 1);
  assert.equal(body.data.selectedDate, "2026-08-12");
});

test("MCL main comparison cache forwards AbortSignal and aliases initial result to resolved date", async () => {
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
  assert.equal(calls.length, 1, "resolved-date request should reuse the initial MCL primary cache entry");
  assert.equal(second.selectedDate, "2026-08-12");

  const aborted = new AbortController();
  aborted.abort("superseded");
  await assert.rejects(
    window.HKCinemaProviders.mcl.getTicketing("123", "2026-08-13", { signal: aborted.signal }),
    error => error?.name === "AbortError"
  );
  assert.equal(calls.length, 1, "aborted requests must not reach the wrapped MCL transport");
});

test("adjacent-date prefetch keeps an AbortController and passes its signal into provider cache helpers", async () => {
  const prefetch = await source("app/provider-compare-prefetch.js");

  assert.match(prefetch, /let activeController = null/);
  assert.match(prefetch, /activeController\.abort\("superseded"\)/);
  assert.match(prefetch, /runPrefetch\(context, ownGeneration, controller\.signal\)/);
  assert.match(prefetch, /prefetchBroadway\(context\.broadwayId, date, signal\)/);
  assert.match(prefetch, /prefetchMCL\(context\.mclId, date, signal\)/);
  assert.match(prefetch, /prefetchEmperor\(context\.emperorId, date, signal\)/);
  assert.match(prefetch, /type === "open" \|\| type === "close" \|\| type === "date-change" \|\| type === "reload"/);
});

test("comparison filters stay presentation-only and changed network helpers are cache-busted", async () => {
  const [filterUx, index] = await Promise.all([
    source("app/phase9b3-filter-compact.js"),
    source("app/index.html")
  ]);

  assert.doesNotMatch(filterUx, /\bfetch\s*\(/);
  assert.match(index, /provider-compare-main-cache-v3\.js\?v=m6d2b/);
  assert.match(index, /provider-compare-prefetch\.js\?v=m6d2b/);
});