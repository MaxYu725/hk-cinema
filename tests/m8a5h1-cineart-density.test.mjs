import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

async function loadCineArtAdapter() {
  const localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };
  const window = {
    HKCinemaViewModels: {
      provider(id) {
        assert.equal(id, "cineart");
        return {
          id: "cineart",
          label: "CineArt",
          bookingUrl: null,
          capabilities: { seatMap: true, booking: false }
        };
      }
    }
  };
  const context = vm.createContext({
    AbortController,
    clearTimeout,
    console,
    Date,
    fetch: async () => { throw new Error("Unexpected network request"); },
    JSON,
    localStorage,
    Math,
    Number,
    Object,
    setTimeout,
    String,
    window
  });
  vm.runInContext(await source("app/providers/cineart.js"), context, {
    filename: "app/providers/cineart.js"
  });
  return window.HKCinemaProviders.cineart;
}

function seat(id, row, column, left, top, status = "available", type = "standard") {
  return {
    id,
    label: id,
    row,
    column,
    status,
    type,
    selectable: status === "available",
    position: {
      left,
      top,
      relativeLeftPercent: -50,
      relativeTopPercent: -50,
      rotate: 0
    }
  };
}

test("M8A5H1 compresses CineArt display pitch while preserving seat semantics", async () => {
  const adapter = await loadCineArtAdapter();
  const model = adapter.viewModels.seatMap({
    showId: "9001",
    screenLabel: "銀幕",
    sections: [{
      id: "main",
      name: "座位區",
      bounds: {
        minLeft: 100,
        maxLeft: 260,
        minTop: 80,
        maxTop: 200,
        width: 160,
        height: 120
      },
      seats: [
        seat("B2", "B", 2, 130, 80, "available", "wheelchair"),
        seat("A2", "A", 2, 130, 120),
        seat("A3", "A", 3, 170, 120, "sold")
      ]
    }]
  }, { sourceId: "9001", bookingUrl: null });

  assert.equal(model.layoutMode, "positioned");
  assert.equal(model.bookingUrl, null);
  assert.equal(model.screenLabel, "銀幕");
  assert.equal(model.sections[0].bounds.width, 115.2);
  assert.equal(model.sections[0].bounds.height, 86.39999999999999);

  const seats = model.sections[0].seats;
  const b2 = seats.find(item => item.id === "B2");
  const a2 = seats.find(item => item.id === "A2");
  const a3 = seats.find(item => item.id === "A3");

  assert.equal(b2.position.top, 80);
  assert.equal(a2.position.top, 108.8);
  assert.equal(a3.position.left, 150.4);
  assert.ok(Math.abs((a2.position.top - b2.position.top) - 28.8) < 1e-9);
  assert.ok(Math.abs((a3.position.left - a2.position.left) - 28.8) < 1e-9);
  assert.equal(b2.type, "wheelchair");
  assert.equal(a3.status, "sold");
  assert.equal(model.summary.total, 3);
  assert.equal(model.summary.available, 2);
  assert.equal(model.summary.sold, 1);
});

test("M8A5H1 remains a browser display transform, not a Worker geometry rewrite", async () => {
  const [adapter, worker, shared, index] = await Promise.all([
    source("app/providers/cineart.js"),
    source("worker/src/providers/cineart-seatmap.js"),
    source("app/seatmap-shared.js"),
    source("app/index.html")
  ]);

  assert.match(adapter, /SEAT_MAP_DISPLAY_DENSITY\s*=\s*0\.72/);
  assert.match(adapter, /compressSeatPosition/);
  assert.match(worker, /official/i);
  assert.doesNotMatch(worker, /SEAT_MAP_DISPLAY_DENSITY/);
  assert.doesNotMatch(shared, /SEAT_MAP_DISPLAY_DENSITY/);
  assertAsset(index, "providers/cineart.js");
});