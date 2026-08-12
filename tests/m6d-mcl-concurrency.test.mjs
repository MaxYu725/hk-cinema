import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

function makeContext(nativeFetch, primaryGetter = async () => null) {
  const provider = { getTicketing: primaryGetter };
  const window = {
    location: { href: "https://maxyu725.github.io/hk-cinema/" },
    fetch: nativeFetch,
    HKCinemaProviders: { mcl: provider }
  };
  const document = { readyState: "complete", addEventListener() {} };
  const context = vm.createContext({
    window,
    document,
    URL,
    Request,
    Response,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout
  });
  return { window, provider, context };
}

test("M6D 2C suppresses eager GetPrice only for comparison cycles and preserves detail/lazy fallback", async () => {
  const bulk = await source("app/mcl-ticketing-bulk-enrichment.js");
  let priceNativeCalls = 0;
  let movieSetCalls = 0;
  let windowRef = null;
  const eagerUrl = "https://www.mclcinema.com/MCLWebAPI2/GetPrice.aspx?l=1&si=101&ci=001";
  const nativeFetch = async input => {
    const url = String(input);
    if (url.includes("services.mclcinema.com/Ticketing/MovieSet")) {
      movieSetCalls += 1;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("MCLWebAPI2/GetPrice.aspx")) priceNativeCalls += 1;
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  const primaryGetter = async () => {
    const response = await windowRef.fetch(eagerUrl, {
      headers: { Accept: "application/json, text/javascript, text/html, */*; q=0.01" }
    });
    await response.json();
    return { sessions: [], allSessions: [], metadataComplete: true, selectedDate: "2026-08-12" };
  };
  const { window, provider, context } = makeContext(nativeFetch, primaryGetter);
  windowRef = window;
  vm.runInContext(bulk, context, { filename: "mcl-ticketing-bulk-enrichment.js" });

  const comparison = new AbortController();
  await provider.getTicketing("14449", "2026-08-12", { signal: comparison.signal });
  assert.equal(priceNativeCalls, 0, "comparison eager WebAPI2 price fetch must not hit the network");
  assert.equal(movieSetCalls, 1, "comparison cycle may use one best-effort MovieSet sidecar");
  assert.equal(window.HKCinemaMCLBulkEnrichment.getStats().suppressedLegacyPriceRequests, 1);

  await provider.getTicketing("14449", "2026-08-12", {});
  assert.equal(priceNativeCalls, 1, "detail/no-signal consumer must retain the WebAPI2 price fallback");
  assert.equal(movieSetCalls, 1, "detail/no-signal consumer must not start the comparison bulk sidecar");

  await window.fetch(eagerUrl, {
    headers: { Accept: "application/json, text/javascript, */*; q=0.01" }
  });
  assert.equal(priceNativeCalls, 2, "lazy-price request signature must remain network-active");
});

test("M6D 2C bulk MovieSet cache aliases the resolved date and avoids duplicate sidecars", async () => {
  const bulk = await source("app/mcl-ticketing-bulk-enrichment.js");
  let movieSetCalls = 0;
  const nativeFetch = async input => {
    const url = String(input);
    if (url.includes("services.mclcinema.com/Ticketing/MovieSet")) {
      movieSetCalls += 1;
      return new Response(JSON.stringify({
        AvailableDates: { a: "2026-08-12" },
        AvailableCinemas: { "1": "MCL Test" },
        AvailableSessions: [{
          SessionID: 101,
          SessionDateTime: "2026-08-12T19:30:00",
          CinemaCodeID: 1,
          ScreenName: "House 1",
          AdultPrice: 92,
          StudentPrice: 82
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200 });
  };
  const primaryGetter = async (_movieSetId, selectedDate = null) => ({
    movieSetId: "14449",
    selectedDate: selectedDate || "2026-08-12",
    sessions: [{
      sourceId: "101",
      price: { display: null, adult: null, student: null, child: null, senior: null },
      seatSummary: {}
    }],
    allSessions: [],
    metadataComplete: true,
    source: { transport: "browser-direct-mclwebapi2" }
  });

  const { provider, context } = makeContext(nativeFetch, primaryGetter);
  vm.runInContext(bulk, context, { filename: "mcl-ticketing-bulk-enrichment.js" });

  const firstController = new AbortController();
  const initial = await provider.getTicketing("14449", null, { signal: firstController.signal });
  assert.equal(initial.sessions[0].price.adult, 92);
  assert.equal(movieSetCalls, 1);

  const secondController = new AbortController();
  const explicit = await provider.getTicketing("14449", "2026-08-12", { signal: secondController.signal });
  assert.equal(explicit.sessions[0].price.adult, 92);
  assert.equal(movieSetCalls, 1, "resolved-date transition should reuse the initial bulk snapshot");
});

test("M6D 2C bulk sidecar uses real abort plumbing instead of an uncancelled Promise.race", async () => {
  const bulk = await source("app/mcl-ticketing-bulk-enrichment.js");
  assert.match(bulk, /const controller = new AbortController\(\)/);
  assert.match(bulk, /controller\.abort\("bulk-timeout"\)/);
  assert.match(bulk, /parentSignal\?\.addEventListener\?\.\("abort", onParentAbort/);
  assert.match(bulk, /const comparisonCycle = Boolean\(options\?\.signal\)/);
  assert.match(bulk, /fetchBulk\(movieSetId, selectedDate, options\)/);
  assert.doesNotMatch(bulk, /Promise\.race\s*\(/);
  assert.doesNotMatch(bulk, /function timeoutAfter\(/);
});

test("M6D 2C keeps bounded lazy price and seat owners with the MCL cache outermost", async () => {
  const [worker, prices, seats, bulk, index] = await Promise.all([
    source("app/mcl-ticketing-worker.js"),
    source("app/provider-compare-prices.js"),
    source("app/provider-compare-seats.js"),
    source("app/mcl-ticketing-bulk-enrichment.js"),
    source("app/index.html")
  ]);

  assert.match(worker, /mapLimit\(\s*sessions,\s*8,\s*session => enrichSessionMetadata/);
  assert.match(worker, /GetPrice\.aspx\?l=1&si=/);
  assert.match(worker, /text\/html, \*\/\*; q=0\.01/);
  assert.match(bulk, /comparisonPricePolicyDepth > 0/);
  assert.match(prices, /const MAX_CONCURRENT = 4/);
  assert.match(prices, /application\/json, text\/javascript, \*\/\*; q=0\.01/);
  assert.match(seats, /const MAX_CONCURRENT = 2/);
  const hybrid = index.indexOf("mcl-ticketing-hybrid.js?v=7a2");
  const bulkIndex = index.indexOf("mcl-ticketing-bulk-enrichment.js?v=8d2-m6d2c");
  const cache = index.indexOf("provider-compare-main-cache-v3.js?v=m6d2b");
  assert.ok(hybrid >= 0 && bulkIndex > hybrid && cache > bulkIndex);
});
