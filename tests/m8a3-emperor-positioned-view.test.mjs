import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

async function loadShared(innerWidth = 390) {
  const document = { activeElement: null, body: null, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const window = {
    innerWidth,
    HKCinemaViewModels: {
      provider(id) {
        return { id: String(id || "").toLowerCase(), label: String(id || ""), capabilities: { seatMap: true, booking: id !== "cineart" } };
      }
    },
    addEventListener() {},
    dispatchEvent() {}
  };
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  const context = vm.createContext({ AbortController, CustomEvent, document, requestAnimationFrame(callback) { callback(); }, setTimeout, clearTimeout, window });
  vm.runInContext(await source("app/seatmap-shared.js"), context, { filename: "seatmap-shared.js" });
  return window.HKCinemaSeatMapShared;
}

function section(width, height = 320) {
  return { name: "座位區", bounds: { minLeft: 0, minTop: 0, width, height }, rows: [{ label: "A", seats: [] }], seats: [] };
}

function seat(id, left, top) {
  return { id, label: id, row: "A", column: Number(id.replace(/\D/g, "")) || 1, status: "available", type: "standard", position: { left, top, relativeLeftPercent: 0, relativeTopPercent: 0, rotate: 0 } };
}

function positionedModel(provider, width) {
  const seats = [seat("A1", 0, 0), seat("A2", Math.max(32, width - 32), 0)];
  return {
    kind: "seat-map",
    provider: { id: provider },
    layoutMode: "positioned",
    screenLabel: "SCREEN",
    summary: { total: 2, available: 2, held: 0, sold: 0, blocked: 0, unavailable: 0, unknown: 0 },
    sections: [{ ...section(width, 64), rows: [{ label: "A", seats }], seats, areas: [] }],
    notices: [], bookingUrl: null, showtime: null
  };
}

test("M8A3 keeps Emperor positioned geometry at 1:1 with fixed 20px seats", async () => {
  const shared = await loadShared(390);
  const compact = shared.positionedMetrics(section(240), "emperor", true);
  const wide = shared.positionedMetrics(section(900), "emperor", true);
  assert.equal(compact.scale, 1);
  assert.equal(wide.scale, 1);
  assert.equal(compact.seatSize, 20);
  assert.equal(wide.seatSize, 20);
  assert.equal(compact.screenOffset, 52);
  assert.equal(wide.screenOffset, 52);
  assert.equal(compact.screenWidth, 240);
  assert.equal(wide.screenWidth, 900);
  assert.equal(compact.scrollable, false);
  assert.equal(wide.scrollable, true);
});

test("M8A3 keeps the Emperor fixed-scale policy provider-scoped", async () => {
  const shared = await loadShared(390);
  const emperor = shared.positionedMetrics(section(900), "emperor", true);
  const generic = shared.positionedMetrics(section(900));
  const cineart = shared.positionedMetrics(section(900), "cineart");
  assert.equal(emperor.scale, 1);
  assert.equal(emperor.seatSize, 20);
  assert.equal(generic.scale, 0.75);
  assert.equal(generic.seatSize, 18);
  assert.equal(cineart.scale, generic.scale);
  assert.equal(cineart.seatSize, generic.seatSize);
  assert.equal(cineart.screenOffset, 0);
});

test("M8A3 places Emperor SCREEN inside the same positioned scroll canvas as seats", async () => {
  const shared = await loadShared(390);
  const html = shared.renderMap(positionedModel("emperor", 900));
  const sectionIndex = html.indexOf('class="shared-seatmap-section"');
  const scrollIndex = html.indexOf('<div class="shared-seatmap-scroll ');
  const canvasIndex = html.indexOf('class="shared-seatmap-positioned-canvas"');
  const screenOwnerIndex = html.indexOf('class="shared-seatmap-positioned-screen"');
  const screenIndex = html.indexOf('class="shared-seatmap-screen"');
  const seatIndex = html.indexOf('class="shared-seat status-available');
  assert.ok(sectionIndex >= 0);
  assert.ok(scrollIndex > sectionIndex);
  assert.ok(canvasIndex > scrollIndex);
  assert.ok(screenOwnerIndex > canvasIndex);
  assert.ok(screenIndex > screenOwnerIndex);
  assert.ok(seatIndex > screenIndex);
  assert.match(html, /shared-seatmap-positioned-screen[^>]+left:42px;top:0;width:900px/);
});

test("M8A3 leaves CineArt positioned screen ownership unchanged", async () => {
  const shared = await loadShared(390);
  const html = shared.renderMap(positionedModel("cineart", 900));
  const screenIndex = html.indexOf('class="shared-seatmap-screen"');
  const sectionIndex = html.indexOf('class="shared-seatmap-section"');
  assert.ok(screenIndex >= 0 && sectionIndex > screenIndex);
  assert.doesNotMatch(html, /shared-seatmap-positioned-screen/);
});

test("M8A3 keeps the shared runtime independently cache-busted", async () => {
  const [index, shared] = await Promise.all([source("app/index.html"), source("app/seatmap-shared.js")]);
  assertAsset(index, "seatmap-shared.js");
  assert.match(shared, /EMPEROR_POSITIONED_SCALE\s*=\s*1/);
  assert.match(shared, /EMPEROR_POSITIONED_SEAT_SIZE\s*=\s*20/);
  assert.match(shared, /EMPEROR_SCREEN_OFFSET\s*=\s*52/);
  assert.match(shared, /providerId === "emperor"/);
});
