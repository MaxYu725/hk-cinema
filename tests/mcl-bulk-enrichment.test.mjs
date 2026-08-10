import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("MCL bulk enrichment captures the MovieSet source before WebAPI2 overrides", async () => {
  const index = await read("app/index.html");
  const capture = index.indexOf("mcl-ticketing-bulk-enrichment.js?v=8d2");
  const webApi = index.indexOf("mcl-ticketing-worker.js?v=7a1");
  const hybrid = index.indexOf("mcl-ticketing-hybrid.js?v=7a2");

  assert.ok(capture > index.indexOf("providers/mcl.js"));
  assert.ok(capture < webApi);
  assert.ok(webApi < hybrid);
});

test("bulk enrichment fills missing MCL prices by SessionID without adding sessions", async () => {
  const source = await read("app/mcl-ticketing-bulk-enrichment.js");
  let ready = null;
  const bulkData = {
    sessions: [
      {
        sourceId: "101",
        house: { name: "House 1" },
        language: "英語 · 字幕: 中文",
        format: "2D",
        price: { display: 90, adult: 90, student: 80, child: null, senior: null }
      },
      {
        sourceId: "102",
        price: { display: 95, adult: 95, student: 85, child: null, senior: null }
      },
      {
        sourceId: "999",
        price: { display: 70, adult: 70 }
      }
    ],
    allSessions: []
  };
  const primaryData = {
    sessions: [
      {
        sourceId: "101",
        house: { name: null },
        language: null,
        format: null,
        price: { display: null, adult: null, student: null, child: null, senior: null },
        seatSummary: { available: null, total: null, occupiedPercent: null }
      },
      {
        sourceId: "102",
        house: { name: "House 2" },
        language: "英語",
        format: "2D",
        price: { display: 85, adult: 85, student: null, child: null, senior: null },
        seatSummary: { available: null, total: null, occupiedPercent: null }
      }
    ],
    allSessions: [],
    source: { transport: "browser-direct" }
  };

  const originalBulkGetter = async () => bulkData;
  const provider = { getTicketing: originalBulkGetter };
  const window = { HKCinemaProviders: { mcl: provider } };
  const document = {
    readyState: "loading",
    addEventListener(type, handler) {
      if (type === "DOMContentLoaded") ready = handler;
    }
  };
  const context = vm.createContext({ window, document, setTimeout, clearTimeout });
  vm.runInContext(source, context, { filename: "mcl-ticketing-bulk-enrichment.js" });

  provider.getTicketing = async () => structuredClone(primaryData);
  assert.equal(typeof ready, "function");
  ready();

  const result = await provider.getTicketing("14449", "2026-08-12", {});

  assert.equal(result.sessions.length, 2);
  assert.deepEqual(result.sessions.map(session => session.sourceId), ["101", "102"]);
  assert.equal(result.sessions[0].price.adult, 90);
  assert.equal(result.sessions[0].price.student, 80);
  assert.equal(result.sessions[0].house.name, "House 1");
  assert.equal(result.sessions[0].language, "英語 · 字幕: 中文");
  assert.equal(result.sessions[0].format, "2D");
  assert.equal(result.sessions[1].price.adult, 85, "primary price must not be overwritten");
  assert.equal(result.bulkEnrichment.source, "services-movieset");
  assert.equal(result.bulkEnrichment.selectedPriceCount, 2);
  assert.equal(result.pricingComplete, true);
  assert.equal(provider.ticketingBulkEnrichmentInstalled, true);
  assert.equal(window.HKCinemaMCLBulkEnrichment.version, "8d2");
});

test("bulk merge leaves the primary result untouched when MovieSet data is unavailable", async () => {
  const source = await read("app/mcl-ticketing-bulk-enrichment.js");
  let ready = null;
  const provider = { getTicketing: async () => null };
  const window = { HKCinemaProviders: { mcl: provider } };
  const document = {
    readyState: "loading",
    addEventListener(type, handler) {
      if (type === "DOMContentLoaded") ready = handler;
    }
  };
  const context = vm.createContext({ window, document, setTimeout, clearTimeout });
  vm.runInContext(source, context);

  const primary = { sessions: [{ sourceId: "1", price: { adult: null } }] };
  assert.equal(window.HKCinemaMCLBulkEnrichment.mergeResult(primary, null), primary);
  assert.equal(typeof ready, "function");
});
