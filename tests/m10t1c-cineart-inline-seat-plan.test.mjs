import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCineArtSeatMapService } from "../worker/src/providers/cineart-seatmap.js";
import { resolveCineArtFlightTextReference } from "../worker/src/providers/cineart-flight.js";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");
const NOW_MS = Date.parse("2026-08-15T14:30:00.000Z");

const PLAN = {
  width: 600,
  height: 500,
  iwidth: 800,
  iheight: 800,
  w: 36,
  h: 33,
  gx: 4,
  gy: 7,
  numSeats: 6,
  blocks: [{
    x: 300,
    y: 250,
    rows: 2,
    cols: 4,
    row: "A",
    ccol: 1,
    col: [1, 1],
    rowDir: "u",
    colDir: "d",
    rr: 0,
    removed: [{ r: 1, c: 0 }, { r: 1, c: 3 }],
    seats: { B2: { type: "wh" } },
    classes: {}
  }],
  comps: []
};

const STATUSES = {
  A2: "A",
  A3: "U",
  B1: "H",
  B2: "A",
  B3: "L",
  B4: "A"
};

function memoryCache() {
  const store = new Map();
  return {
    async match(request) {
      const response = store.get(request.url);
      return response ? response.clone() : null;
    },
    async put(request, response) {
      store.set(request.url, response.clone());
    }
  };
}

function inlinePlanHtml() {
  const props = {
    lng: "hk",
    showDetail: {
      show: {
        id: 81647,
        movie: { id: 799 },
        site: { id: 16 },
        house: { id: 43 },
        plan: { config: JSON.stringify(PLAN) }
      }
    },
    showId: 81647,
    seatStatus: { seats: STATUSES }
  };
  const flight = `0:${JSON.stringify(props)}\n`;
  return `<html><body><script>self.__next_f.push([1,${JSON.stringify(flight)}])</script></body></html>`;
}

test("M10T1C resolver accepts official inline JSON plan strings while preserving Flight references", () => {
  assert.deepEqual(
    resolveCineArtFlightTextReference("", JSON.stringify(PLAN)),
    PLAN
  );
  assert.deepEqual(
    resolveCineArtFlightTextReference('1a:T7,{"a":1}', "$1a"),
    { a: 1 }
  );
  assert.equal(resolveCineArtFlightTextReference("", "{broken"), null);
  assert.equal(resolveCineArtFlightTextReference("", "[]"), null);
  assert.equal(resolveCineArtFlightTextReference("", "not-a-plan"), null);
});

test("M10T1C Worker reconstructs inline-plan CineArt geometry without weakening exact seat correlation", async () => {
  const html = inlinePlanHtml();
  let calls = 0;
  const service = createCineArtSeatMapService({
    cache: memoryCache(),
    now: () => NOW_MS,
    fetchImpl: async url => {
      calls += 1;
      assert.equal(String(url), "https://cinearthouse.com.hk/hk/show/81647");
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }
  });

  const result = await service.get("81647", "799");
  assert.equal(calls, 1);
  assert.equal(result.layoutMode, "positioned");
  assert.equal(result.canvas.width, 600);
  assert.equal(result.canvas.height, 500);
  assert.equal(result.canvas.blockCount, 1);
  assert.deepEqual(result.counts, {
    total: 6,
    available: 3,
    held: 1,
    sold: 1,
    blocked: 1,
    unknown: 0,
    unavailable: 3,
    wheelchair: 1
  });
  const seats = result.sections[0].seats;
  assert.equal(seats.length, Object.keys(STATUSES).length);
  assert.deepEqual(seats.map(seat => seat.id).sort(), Object.keys(STATUSES).sort());
  assert.equal(seats.find(seat => seat.id === "B2")?.type, "wheelchair");
  assert.equal(seats.every(seat => seat.selectable === (seat.status === "available")), true);
  assert.equal("seatStatus" in result, false);
  assert.equal("plan" in result, false);

  const cached = await service.get("81647", "799");
  assert.equal(calls, 1);
  assert.equal(cached.meta.cacheState, "fresh-edge");
});

test("M10T1C CineArt comparison labels coarse not-sold counts as unverified selectable inventory", async () => {
  const [adapter, index] = await Promise.all([
    source("app/providers/cineart.js"),
    source("app/index.html")
  ]);
  assert.match(adapter, /未售（未核實可選）/);
  assert.doesNotMatch(adapter, /未售（非可選數）/);
  assertAsset(index, "providers/cineart.js");
});
