import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

function makeContext(nativeFetch, bulkGetter = async () => null) {
  let ready = null;
  const provider = { getTicketing: bulkGetter };
  const window = {
    location: { href: "https://maxyu725.github.io/hk-cinema/" },
    fetch: nativeFetch,
    HKCinemaProviders: { mcl: provider }
  };
  const document = {
    readyState: "loading",
    addEventListener(type, handler) {
      if (type === "DOMContentLoaded") ready = handler;
    }
  };
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
  return { window, provider, context, getReady: () => ready };
}

test("M6D 2C retires legacy eager GetPrice network ownership without blocking lazy price", async () => {
  const bulk = await source("app/mcl-ticketing-bulk-enrichment.js");
  let nativeCalls = 0;
  const nativeFetch = async () => {
    nativeCalls += 1;
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  const { window, context } = makeContext(nativeFetch);
  vm.runInContext(bulk, context, { filename: "mcl-ticketing-bulk-enrichment.js" });

  const eager = await window.fetch(
    "https://www.mclcinema.com/MCLWebAPI2/GetPrice.aspx?l=1&si=101&ci=001",
    { headers: { Accept: "application/json, text/javascript, text/html, */*; q=0.01" } }
  );
  assert.equal(nativeCalls, 0, "legacy eager WebAPI2 price fetch must not hit the network");
  assert.deepEqual(await eager.json(), []);
  assert.equal(window.HKCinemaMCLBulkEnrichment.getStats().suppressedLegacyPriceRequests, 1);

  await window.fetch(
    "https://www.mclcinema.com/MCLWebAPI2/GetPrice.aspx?l=1&si=101&ci=001",
    { headers: { Accept: "application/json, text/javascript, */*; q=0.01" } }
  );
  assert.equal(nativeCalls, 1, "lazy-price request signature must remain network-active");
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

  const { window, provider, context, getReady } = makeContext(nativeFetch);
  vm.runInContext(bulk, context, { filename: "mcl-ticketing-bulk-enrichment.js" });

  provider.getTicketing = async (_movieSetId, selectedDate = null) => ({
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
  getReady()();

  const initial = await provider.getTicketing("14449", null, {});
  assert.equal(initial.sessions[0].price.adult, 92);
  assert.equal(movieSetCalls, 1);

  const explicit = await provider.getTicketing("14449", "2026-08-12", {});
  assert.equal(explicit.sessions[0].price.adult, 92);
  assert.equal(movieSetCalls, 1, "resolved-date transition should reuse the initial bulk snapshot");
});

test("M6D 2C bulk sidecar uses real abort plumbing instead of an uncancelled Promise.race", async () => {
  const bulk = await source("app/mcl-ticketing-bulk-enrichment.js");
  assert.match(bulk, /const controller = new AbortController\(\)/);
  assert.match(bulk, /controller\.abort\("bulk-timeout"\)/);
  assert.match(bulk, /parentSignal\?\.addEventListener\?\.\("abort", onParentAbort/);
  assert.match(bulk, /fetchBulk\(movieSetId, selectedDate, options\)/);
  assert.doesNotMatch(bulk, /Promise\.race\s*\(/);
  assert.doesNotMatch(bulk, /function timeoutAfter\(/);
});

test("M6D 2C keeps bounded lazy price and seat owners", async () => {
  const [worker, prices, seats, bulk, index] = await Promise.all([
    source("app/mcl-ticketing-worker.js"),
    source("app/provider-compare-prices.js"),
    source("app/provider-compare-seats.js"),
    source("app/mcl-ticketing-bulk-enrichment.js"),
    source("app/index.html")
  ]);

  assert.match(worker, /mapLimit\(\s*sessions,\s*8,\s*session => enrichSessionMetadata/);
  assert.match(worker, /GetPrice\.aspx\?l=1&si=/);
  assert.match(worker, /text\/html, \/\*; q=0\.01/);
  assert.match(bulk, /isLegacyEagerPrice/);
  assert.match(prices, /const MAX_CONCURRENT = 4/);
  assert.match(prices, /application\/json, text\/javascript, \/\*; q=0\.01/);
  assert.match(seats, /const MAX_CONCURRENT = 2/);
  assert.match(index, /mcl-ticketing-bulk-enrichment\.js\?v=8d2-m6d2c/);
});
