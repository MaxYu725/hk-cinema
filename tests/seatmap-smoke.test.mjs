import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../app/", import.meta.url);

async function source(name) {
  return readFile(new URL(name, APP), "utf8");
}

async function loadSeatMapScript(name, { innerWidth = 390 } = {}) {
  const document = {
    activeElement: null,
    body: null,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    innerWidth,
    location: { href: "https://example.test/" },
    fetch: async () => { throw new Error("Unexpected network request"); },
    addEventListener() {},
    dispatchEvent() {}
  };
  class MutationObserver {
    observe() {}
  }
  class Request {}

  const context = vm.createContext({
    AbortController,
    clearTimeout,
    console,
    document,
    fetch: window.fetch,
    location: window.location,
    MutationObserver,
    Request,
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    URL,
    window
  });

  vm.runInContext(await source("seatmap-shared.js"), context, { filename: "seatmap-shared.js" });
  vm.runInContext(await source(name), context, { filename: name });
  return context;
}

test("shared trigger and horizontal centering stay deterministic", async () => {
  const context = await loadSeatMapScript("seatmap.js");
  const shared = context.window.HKCinemaSeatMapShared;
  const classes = new Set();
  const attributes = new Map();
  const node = {
    classList: { add(...names) { names.forEach(name => classes.add(name)); } },
    dataset: {},
    setAttribute(name, value) { attributes.set(name, value); }
  };

  shared.prepareTrigger(node, { provider: "MCL", label: "查看座位圖" });
  assert.equal(node.dataset.seatmapProvider, "mcl");
  assert.ok(classes.has("seatmap-launch"));
  assert.ok(classes.has("mcl-seatmap-launch"));
  assert.equal(attributes.get("role"), "button");
  assert.equal(attributes.get("tabindex"), "0");
  assert.equal(attributes.get("aria-label"), "查看座位圖");
  assert.equal(shared.isActivationKey({ key: "Enter" }), true);
  assert.equal(shared.isActivationKey({ key: " " }), true);
  assert.equal(shared.isActivationKey({ key: "Escape" }), false);

  const wide = { scrollWidth: 1400, clientWidth: 700, scrollLeft: 0 };
  const compact = { scrollWidth: 500, clientWidth: 700, scrollLeft: 99 };
  assert.equal(shared.centerHorizontally(wide), 350);
  assert.equal(wide.scrollLeft, 350);
  assert.equal(shared.centerHorizontally(compact), 0);
  assert.equal(compact.scrollLeft, 0);
});

test("Broadway renderer exposes accurate counts, labels and controls", async () => {
  const context = await loadSeatMapScript("seatmap.js");
  const api = context.window.HKCinemaBroadwaySeatMap;
  const html = api.renderSeatMap({
    screen: "SCREEN",
    summary: { available: 2, held: 1, unavailable: 1, total: 4 },
    rows: [{
      name: "A",
      seats: [
        { row: "A", label: "1", column: 1, status: "available", type: "standard" },
        { row: "A", label: "2", column: 3, status: "held", type: "wheelchair" }
      ]
    }]
  });

  assert.match(html, /BROADWAY · SEAT MAP/);
  assert.match(html, /<strong>2<\/strong><span>可選<\/span>/);
  assert.match(html, /seat-gap/);
  assert.match(html, /♿/);
  assert.match(html, /data-broadway-seatmap-close/);
  assert.equal(api.getStats().requestTimeoutMs, 12000);
});

test("MCL wide official layout keeps row labels outside the scroller", async () => {
  const context = await loadSeatMapScript("mcl-seatmap.js", { innerWidth: 390 });
  const api = context.window.HKCinemaMCLSeatMap;
  const blankCells = Array.from({ length: 32 }, () => ({ type: "blank" }));
  const data = {
    layoutVersion: 3,
    totalColumns: 32,
    screenLabel: "銀幕",
    counts: { available: 1, sold: 1, blocked: 0 },
    areas: [{
      name: "普通區",
      cellColumns: 32,
      ratioLeft: 0,
      ratioTop: 0,
      rows: [
        { name: "A", cells: blankCells },
        { name: "B", cells: blankCells }
      ]
    }]
  };

  const metrics = api.layoutMetricsV3(data);
  const html = api.renderMap(data, "https://example.test/buy?si=1&ci=2");
  assert.equal(metrics.scrollable, true);
  assert.ok(metrics.canvasWidth > metrics.availableWidth);
  assert.match(html, /mcl-seatmap-stage is-scrollable/);
  assert.match(html, /mcl-seatmap-fixed-rows/);
  assert.match(html, /mcl-seatmap-fixed-row[^>]*>A<\/span>/);
  assert.match(html, /MCL CINEMAS · SEAT MAP/);
  assert.match(html, /data-mcl-seatmap-close/);
  assert.equal(api.getStats().requestTimeoutMs, 12000);
});

test("Emperor section keeps fixed row labels separate from official geometry", async () => {
  const context = await loadSeatMapScript("emperor-seatmap.js");
  const api = context.window.HKCinemaEmperorSeatMap;
  const html = api.renderSection({
    name: "普通區",
    bounds: { minLeft: 10, minTop: 20, width: 400, height: 120 },
    areas: [{ name: "普通區", price: 120 }],
    seats: [
      {
        name: "A1",
        rowName: "A",
        columnName: "1",
        status: "available",
        type: "general",
        areaName: "普通區",
        position: { left: 10, top: 20, relativeLeftPercent: 0, relativeTopPercent: 0, rotate: 0 }
      },
      {
        name: "B1",
        rowName: "B",
        columnName: "1",
        status: "unavailable",
        type: "general",
        areaName: "普通區",
        position: { left: 10, top: 60, relativeLeftPercent: 0, relativeTopPercent: 0, rotate: 0 }
      }
    ]
  });

  const canvasEnd = html.indexOf("</div>\n          </div>\n          <div class=\"emperor-seatmap-row-labels\"");
  assert.ok(canvasEnd > -1);
  assert.match(html, /emperor-seatmap-canvas[^]*status-available/);
  assert.match(html, /emperor-seatmap-row-labels[^]*>A<\/span>/);
  assert.match(html, /emperor-seatmap-row-labels[^]*>B<\/span>/);
  assert.equal(api.getStats().requestTimeoutMs, 12000);
});

test("three-provider reliability and copy contracts remain wired", async () => {
  const [index, broadway, mcl, emperor, mclDetail, emperorDetail, compare] = await Promise.all([
    source("index.html"),
    source("seatmap.js"),
    source("mcl-seatmap.js"),
    source("emperor-seatmap.js"),
    source("mcl-detail.js"),
    source("emperor-detail.js"),
    source("provider-compare-v3.js")
  ]);

  for (const provider of [broadway, mcl, emperor]) {
    assert.match(provider, /REQUEST_TIMEOUT_MS = 12000/);
    assert.match(provider, /AbortController/);
    assert.match(provider, /重新載入/);
  }
  assert.ok(index.indexOf("seatmap-shared.js?v=6f1") < index.indexOf("emperor-seatmap.js?v=6n1"));
  assert.ok(index.indexOf("seatmap-shared.js?v=6f1") < index.indexOf("seatmap.js?v=6o1"));
  assert.ok(index.indexOf("seatmap-shared.js?v=6f1") < index.indexOf("mcl-seatmap.js?v=6o1"));
  assert.doesNotMatch(mclDetail, /完整座位圖會在下一階段接入/);
  assert.doesNotMatch(emperorDetail, /並非即時可選座位圖/);
  assert.doesNotMatch(compare, /點場次會前往所屬院線官方購票頁/);
});
