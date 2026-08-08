import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function loadCore() {
  const window = {};
  const context = vm.createContext({ window });
  vm.runInContext(await source("app/home-library-core.js"), context, {
    filename: "home-library-core.js"
  });
  return window.HKCinemaHomeLibraryCore;
}

test("home search handles punctuation, spacing and multiple terms", async () => {
  const core = await loadCore();
  const values = [
    "劇場版 CHIIKAWA：人魚島的秘密",
    "Japanese Version",
    "Broadway Emperor"
  ];

  assert.equal(core.searchMatches(values, "chiikawa 日語"), false);
  assert.equal(core.searchMatches(values, "chiikawa japanese"), true);
  assert.equal(core.searchMatches(values, "人魚島 秘密"), true);
  assert.equal(core.searchMatches(values, "MCL"), false);
});

test("home sorting supports provider coverage, titles and recent activity", async () => {
  const core = await loadCore();
  const items = [
    { title: "B", providerCount: 1, defaultOrder: 1, lastViewedAt: 10 },
    { title: "A", providerCount: 3, defaultOrder: 2, lastViewedAt: 20 }
  ];

  assert.equal([...items].sort((a, b) => core.compareItems(a, b, "default"))[0].title, "B");
  assert.equal([...items].sort((a, b) => core.compareItems(a, b, "providers"))[0].title, "A");
  assert.equal([...items].sort((a, b) => core.compareItems(a, b, "title"))[0].title, "A");
  assert.equal([...items].sort((a, b) => core.compareItems(a, b, "recent"))[0].title, "A");
});

test("language and presentation facets compose across categories", async () => {
  const core = await loadCore();
  const facets = core.extractFacets([
    "劇場版 CHIIKAWA 人魚島的秘密（日語版）",
    "IMAX2D with Laser"
  ]);

  assert.deepEqual(Array.from(facets.language), ["japanese"]);
  assert.ok(facets.format.includes("2d"));
  assert.ok(facets.format.includes("imax"));
  assert.equal(core.facetMatches(facets, {
    language: new Set(["japanese"]),
    format: new Set(["imax"])
  }), true);
  assert.equal(core.facetMatches(facets, {
    language: new Set(["cantonese"]),
    format: new Set(["imax"])
  }), false);
});

test("Phase 6I search, library and card actions stay wired", async () => {
  const [index, app, multiProvider, library, styles] = await Promise.all([
    source("app/index.html"),
    source("app/app.js"),
    source("app/multi-provider.js"),
    source("app/home-library.js"),
    source("app/home-library.css")
  ]);

  assert.ok(index.indexOf("home-library-core.js?v=6j1") < index.indexOf("home-library.js?v=6j2"));
  assert.ok(index.indexOf("multi-provider.js?v=6j1") < index.indexOf("home-library-core.js?v=6j1"));
  assert.match(app, /data-movie-favorite/);
  assert.match(multiProvider, /providerVisible/);
  assert.match(multiProvider, /HKCinemaHomeLibrary/);
  assert.match(library, /data-home-movie-search/);
  assert.match(library, /data-home-library-view/);
  assert.match(library, /data-home-recent-clear/);
  assert.match(library, /data-home-facet/);
  assert.match(library, /HKCinemaHomeProviderFilters/);
  assert.match(styles, /\.movie-favorite-button/);
});

test("Phase 6J removes the temporary hero and moves compact health into the topbar", async () => {
  const [index, health, healthStyles] = await Promise.all([
    source("app/index.html"),
    source("app/data-health.js"),
    source("app/data-health.css")
  ]);

  assert.doesNotMatch(index, /今晚睇咩戲/);
  assert.doesNotMatch(index, /class="hero"/);
  assert.match(index, /id="topbarActions"/);
  assert.match(health, /data-health-lights/);
  assert.match(health, /topbarActions\.insertBefore/);
  assert.match(healthStyles, /\.data-health-light\.fresh/);
  assert.match(healthStyles, /\.has-data-health \.status-card/);
});
