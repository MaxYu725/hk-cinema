import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAssetOrder } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const source = await read("app/comparison-store.js");

function loadStore() {
  const listeners = new Map();
  const window = {
    HKCinemaCinemaRegistry: {
      normalize(value) { return String(value).toLowerCase(); },
      resolve(provider, cinema) {
        return { provider, canonical: cinema, region: cinema.includes("Kowloon") ? "kln" : "hk", district: cinema.includes("Kowloon") ? "油尖旺" : "中西區" };
      }
    },
    addEventListener(type, handler) {
      const entries = listeners.get(type) || [];
      entries.push(handler);
      listeners.set(type, entries);
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    }
  };
  const context = vm.createContext({
    window,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    Date,
    Intl,
    Map,
    Math,
    Number,
    Object,
    Set,
    String
  });
  vm.runInContext(source, context, { filename: "comparison-store.js" });
  return { window, store: window.HKCinemaComparisonStore };
}

function session(overrides = {}) {
  return {
    id: "broadway:show-1",
    provider: "broadway",
    providerLabel: "Broadway",
    time: "14:00",
    cinemaName: "Central Cinema",
    metadata: { languages: ["cantonese"], subtitles: ["chinese"], formats: ["2d"] },
    price: 100,
    seatAvailable: 50,
    seatTotal: 100,
    ...overrides
  };
}

test("C4 loads the comparison store before the renderer and selector consumers", async () => {
  const index = await read("app/index.html");
  assertAssetOrder(index, "comparison-store.js", "provider-compare-v4.js", "provider-compare-insights-v4.js");
  assertAssetOrder(index, "comparison-store.js", "provider-compare-recommendations-v4.js");
});

test("C4 publishes canonical comparison records with stable interaction ids", () => {
  const { store } = loadStore();
  const records = store.publish({ matchId: "movie-1", selectedDate: "2026-08-11", sessions: [session()] });
  assert.equal(records[0].id, "broadway:show-1");
  assert.equal(records[0].comparisonId, "broadway:show-1");
  assert.equal(records[0].timeMinutes, 14 * 60);
  assert.equal(records[0].cinemaKey, "broadway:central cinema");
  assert.deepEqual({ ...records[0].seats }, { available: 50, total: 100, ratio: 0.5 });
});

test("C4 selectors filter and sort canonical records without mutating the source", () => {
  const { store } = loadStore();
  store.publish({
    matchId: "movie-1",
    selectedDate: "2026-08-11",
    sessions: [
      session(),
      session({ id: "mcl:show-2", provider: "mcl", providerLabel: "MCL", time: "12:00", cinemaName: "Kowloon Cinema", price: 80, seatAvailable: 10, seatTotal: 100 })
    ]
  });
  const before = store.getState();
  const selected = store.selectSessions({ filters: { ...store.DEFAULT_FILTERS, region: "kln", sort: "price" } });
  assert.deepEqual(Array.from(selected, item => item.id), ["mcl:show-2"]);
  assert.deepEqual(Array.from(store.getState().sessions, item => item.id), Array.from(before.sessions, item => item.id));
});

test("C4 enrichment events patch the addressed record instead of reparsing rendered text", () => {
  const { window, store } = loadStore();
  store.publish({ matchId: "movie-1", selectedDate: "2026-08-11", sessions: [session({ price: null, seatAvailable: null, seatTotal: null })] });
  window.dispatchEvent({
    type: "hkcinema:compare-price",
    detail: { comparisonSessionId: "broadway:show-1", adult: 88 }
  });
  window.dispatchEvent({
    type: "hkcinema:compare-seat-summary",
    detail: { comparisonSessionId: "broadway:show-1", available: 20, total: 80 }
  });
  const record = store.getState().sessions[0];
  assert.equal(record.price, 88);
  assert.deepEqual({ ...record.seats }, { available: 20, total: 80, ratio: 0.25 });
});

test("C4 selector consumers no longer observe or parse the rendered timeline", async () => {
  const [insights, recommendations, preferences] = await Promise.all([
    read("app/provider-compare-insights-v4.js"),
    read("app/provider-compare-recommendations-v4.js"),
    read("app/provider-compare-preferences-v2.js")
  ]);
  for (const consumer of [insights, recommendations, preferences]) {
    assert.doesNotMatch(consumer, /new MutationObserver/);
  }
  assert.doesNotMatch(insights, /provider-compare-show-time[\s\S]{0,160}textContent/);
  assert.doesNotMatch(recommendations, /provider-compare-show-(?:time|price)[\s\S]{0,160}textContent/);
  assert.match(insights, /HKCinemaComparisonStore/);
  assert.match(recommendations, /HKCinemaComparisonStore/);
});
