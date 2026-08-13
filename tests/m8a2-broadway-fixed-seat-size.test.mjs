import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

async function loadShared(innerWidth = 390) {
  const document = {
    activeElement: null,
    body: null,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    innerWidth,
    addEventListener() {},
    dispatchEvent() {}
  };
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const context = vm.createContext({
    AbortController,
    CustomEvent,
    document,
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    clearTimeout,
    window
  });
  vm.runInContext(await source("app/seatmap-shared.js"), context, { filename: "seatmap-shared.js" });
  return window.HKCinemaSeatMapShared;
}

function gridModel(provider, columns) {
  return {
    provider: { id: provider },
    sections: [{
      rows: [{
        label: "A",
        cells: Array.from({ length: columns }, () => ({ kind: "gap" }))
      }]
    }]
  };
}

test("M8A2 fixes Broadway grid seats at the accepted 20px viewing size", async () => {
  const shared = await loadShared(390);
  const compact = shared.gridMetrics(gridModel("broadway", 12));
  const medium = shared.gridMetrics(gridModel("broadway", 14));
  const wide = shared.gridMetrics(gridModel("broadway", 32));

  assert.equal(compact.size, 20);
  assert.equal(medium.size, 20);
  assert.equal(wide.size, 20);
  assert.equal(compact.scrollable, false);
  assert.equal(medium.scrollable, true);
  assert.equal(wide.scrollable, true);
  assert.ok(wide.contentWidth > medium.contentWidth);
  assert.ok(medium.contentWidth > compact.contentWidth);
});

test("M8A2 keeps the fixed Broadway policy provider-scoped", async () => {
  const shared = await loadShared(390);
  const generic = shared.gridMetrics(gridModel("fixture", 14));

  assert.notEqual(generic.size, 20);
  assert.equal(generic.size, 18);
});

test("M8A2 preserves the shared horizontal-centering lifecycle for wide Broadway halls", async () => {
  const shared = await loadShared(390);
  const scroller = { scrollWidth: 760, clientWidth: 334, scrollLeft: 0 };

  assert.equal(shared.centerHorizontally(scroller), 213);
  assert.equal(scroller.scrollLeft, 213);
});

test("M8A2 hotfix keeps the Broadway screen inside the same horizontal scroll owner as seats", async () => {
  const shared = await source("app/seatmap-shared.js");
  const renderGridStart = shared.indexOf("function renderGrid(model)");
  const renderAreaStart = shared.indexOf("function areaGridMetrics(model)", renderGridStart);
  const renderGrid = shared.slice(renderGridStart, renderAreaStart);

  const viewportIndex = renderGrid.indexOf('class="shared-seatmap-viewport"');
  const scrollIndex = renderGrid.indexOf('<div class="shared-seatmap-scroll ');
  const gridIndex = renderGrid.indexOf('class="shared-seatmap-grid"');
  const screenOwnerIndex = renderGrid.indexOf('class="shared-seatmap-grid-screen"');
  const screenIndex = renderGrid.indexOf("renderScreen(model.screenLabel, screenWidth)");

  assert.ok(renderGridStart >= 0 && renderAreaStart > renderGridStart);
  assert.ok(viewportIndex >= 0);
  assert.ok(scrollIndex > viewportIndex);
  assert.ok(gridIndex > scrollIndex);
  assert.ok(screenOwnerIndex > gridIndex);
  assert.ok(screenIndex > screenOwnerIndex);
  assert.doesNotMatch(renderGrid.slice(0, viewportIndex), /renderScreen\(/);
  assert.match(renderGrid, /padding-left:34px/);
});

test("M8A2 rotates only the shared seat-map runtime asset contract", async () => {
  const [index, shared] = await Promise.all([
    source("app/index.html"),
    source("app/seatmap-shared.js")
  ]);

  assertAsset(index, "seatmap-shared.js");
  assert.match(shared, /BROADWAY_GRID_SEAT_SIZE\s*=\s*20/);
  assert.match(shared, /model\?\.provider\?\.id === "broadway"[\s\S]*BROADWAY_GRID_SEAT_SIZE/);
  assert.match(shared, /MCL_AREA_GRID_SEAT_SIZE\s*=\s*20/);
  assert.match(shared, /function positionedMetrics\(section\)/);
});
