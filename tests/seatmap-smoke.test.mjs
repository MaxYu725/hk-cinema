import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function fixtures() {
  return JSON.parse(await source("tests/fixtures/phase7b-view-models.json"));
}

async function loadSeatMaps({ innerWidth = 390, providerScripts = false } = {}) {
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
  class MutationObserver { observe() {} }
  class Request {}
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const context = vm.createContext({
    AbortController,
    clearTimeout,
    console,
    CustomEvent,
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
  for (const path of ["app/showtime-metadata.js", "app/view-models.js", "app/seatmap-shared.js"]) {
    vm.runInContext(await source(path), context, { filename: path });
  }
  if (providerScripts) {
    for (const path of ["app/seatmap.js", "app/mcl-seatmap.js", "app/emperor-seatmap.js"]) {
      vm.runInContext(await source(path), context, { filename: path });
    }
  }
  return context;
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

test("shared trigger and horizontal centering stay deterministic", async () => {
  const context = await loadSeatMaps();
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
  assert.equal(shared.centerHorizontally(compact), 0);
});

test("all providers render through one full-screen SeatMapViewModel structure", async () => {
  const [context, data] = await Promise.all([loadSeatMaps(), fixtures()]);
  const models = context.window.HKCinemaViewModels;
  const renderer = context.window.HKCinemaSeatMapShared;
  const inputs = {
    broadway: [data.broadway.seatMap, data.broadway.showtime],
    mcl: [data.mcl.seatMap, data.mcl.showtime],
    emperor: [data.emperor.seatMap, data.emperor.showtime]
  };

  for (const [provider, [seatMap, showtime]] of Object.entries(inputs)) {
    const model = models.seatMap(provider, seatMap, showtime);
    const html = renderer.renderMap(model);
    assert.match(html, new RegExp(`class="shared-seatmap-content" data-seatmap-provider="${provider}"`));
    assert.match(html, /class="shared-seatmap-header"/);
    assert.match(html, /class="shared-seatmap-summary"/);
    assert.match(html, /class="shared-seatmap-legends"/);
    assert.match(html, /class="shared-seatmap-layout"/);
    assert.match(html, /class="shared-seatmap-footer"/);
    assert.match(html, /class="shared-seatmap-booking"/);
    assert.doesNotMatch(html, /undefined|\[object Object\]/);
  }
});

test("shared renderer preserves Broadway gaps, MCL areas and Emperor geometry", async () => {
  const [context, data] = await Promise.all([loadSeatMaps(), fixtures()]);
  const models = context.window.HKCinemaViewModels;
  const renderer = context.window.HKCinemaSeatMapShared;

  const broadway = renderer.renderMap(models.seatMap("broadway", data.broadway.seatMap, data.broadway.showtime));
  assert.match(broadway, /data-layout-mode="grid"/);
  assert.match(broadway, /shared-seat gap/);
  assert.match(broadway, /status-held type-wheelchair/);
  assert.match(broadway, /<strong>3<\/strong><span>總座位<\/span>/);

  const mcl = renderer.renderMap(models.seatMap("mcl", data.mcl.seatMap, data.mcl.showtime));
  assert.match(mcl, /data-layout-mode="area-grid"/);
  assert.match(mcl, /shared-seatmap-area-canvas/);
  assert.match(mcl, /status-sold type-sofa is-wide/);
  assert.match(mcl, /status-blocked type-standard/);

  const emperor = renderer.renderMap(models.seatMap("emperor", data.emperor.seatMap, data.emperor.showtime));
  assert.match(emperor, /data-layout-mode="positioned"/);
  assert.match(emperor, /shared-seatmap-positioned-canvas/);
  assert.match(emperor, /type-recliner/);
  assert.match(emperor, /type-motion/);
  assert.match(emperor, /type-couple/);
  assert.match(emperor, /普通區 · \$130/);
  assert.match(emperor, /實際座位以官方頁面為準/);
  assert.doesNotMatch(emperor, /已售<\/span>/);
});

test("normal halls fit while large and IMAX layouts retain readable seats and scroll", async () => {
  const compactContext = await loadSeatMaps({ innerWidth: 390 });
  const shared = compactContext.window.HKCinemaSeatMapShared;
  const models = compactContext.window.HKCinemaViewModels;
  const normalRows = [{
    name: "A",
    seats: Array.from({ length: 14 }, (_, index) => ({
      id: `A${index + 1}`,
      label: String(index + 1),
      row: "A",
      column: index + 1,
      status: "available",
      type: "standard"
    }))
  }];
  const imaxRows = [{
    name: "A",
    seats: Array.from({ length: 32 }, (_, index) => ({
      id: `A${index + 1}`,
      label: String(index + 1),
      row: "A",
      column: index + 1,
      status: "available",
      type: "standard"
    }))
  }];
  const normal = models.seatMap("broadway", { showId: "1", rows: normalRows }, { sourceId: "1" });
  const imax = models.seatMap("broadway", { showId: "2", rows: imaxRows }, { sourceId: "2" });
  assert.equal(shared.gridMetrics(normal).scrollable, false);
  assert.equal(shared.gridMetrics(imax).scrollable, true);
  assert.ok(shared.gridMetrics(imax).size >= 17);

  const wideMcl = models.seatMap("mcl", {
    sessionId: "3",
    totalColumns: 32,
    areas: [{
      name: "IMAX",
      cellColumns: 32,
      ratioLeft: 0,
      ratioTop: 0,
      rows: [
        { name: "A", cells: Array.from({ length: 32 }, (_, index) => ({ type: "blank", cellIndex: index })) },
        { name: "B", cells: Array.from({ length: 32 }, (_, index) => ({ type: "blank", cellIndex: index })) }
      ]
    }]
  }, { sourceId: "3" });
  const metrics = shared.areaGridMetrics(wideMcl);
  const html = shared.renderMap(wideMcl);
  assert.equal(metrics.scrollable, true);
  assert.ok(metrics.cellSize >= 17);
  assert.match(html, /大型／闊身影廳/);
  assert.match(html, /shared-seatmap-fixed-rows/);

  assert.equal(shared.positionedMetrics({ bounds: { width: 280, height: 120 } }).scrollable, false);
  assert.equal(shared.positionedMetrics({ bounds: { width: 900, height: 320 } }).scrollable, true);
  assert.ok(shared.positionedMetrics({ bounds: { width: 900, height: 320 } }).seatSize >= 18);
});

test("three provider clients delegate fetch results to the shared lifecycle", async () => {
  const [index, shared, broadway, mcl, emperor, css] = await Promise.all([
    source("app/index.html"),
    source("app/seatmap-shared.js"),
    source("app/seatmap.js"),
    source("app/mcl-seatmap.js"),
    source("app/emperor-seatmap.js"),
    source("app/seatmap-shared.css")
  ]);

  for (const provider of [broadway, mcl, emperor]) {
    assert.match(provider, /shared\?\.open\(\{/);
    assert.match(provider, /HKCinemaViewModels\.seatMap/);
    assert.doesNotMatch(provider, /innerHTML\s*=/);
    assert.doesNotMatch(provider, /function render(?:Map|Seat|Section|Legend)/);
  }
  assert.match(shared, /REQUEST_TIMEOUT_MS = 12000/);
  assert.match(shared, /AbortController/);
  assert.match(shared, /data-seatmap-retry/);
  assert.match(shared, /aria-modal="true"/);
  assert.match(shared, /event\.key === "Escape"/);
  assert.match(css, /body\.seatmap-open/);
  assert.match(css, /@media \(max-width: 360px\)/);

  const sharedIndex = index.indexOf("seatmap-shared.js?v=7b3");
  assert.ok(sharedIndex > index.indexOf("view-models.js?v=7b3"));
  for (const loader of ["emperor-seatmap.js?v=7b3", "seatmap.js?v=7b3", "mcl-seatmap.js?v=7b3"]) {
    assert.ok(index.indexOf(loader) > sharedIndex, `${loader} must load after the shared renderer`);
  }
  assert.match(index, /seatmap-shared\.css\?v=7b3/);
  assert.doesNotMatch(index, /(?:mcl-|emperor-)?seatmap\.css\?v=/);
});

test("provider clients still expose one reliability surface", async () => {
  const context = await loadSeatMaps({ providerScripts: true });
  assert.equal(context.window.HKCinemaBroadwaySeatMap.getStats().requestTimeoutMs, 12000);
  assert.equal(context.window.HKCinemaMCLSeatMap.getStats().requestTimeoutMs, 12000);
  assert.equal(context.window.HKCinemaEmperorSeatMap.getStats().requestTimeoutMs, 12000);
  assert.equal(context.window.HKCinemaSeatMapShared.version, "7b3");
});
