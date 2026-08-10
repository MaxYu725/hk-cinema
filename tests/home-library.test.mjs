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
    "IMAX2D with Laser"
  ];

  assert.equal(core.version, "8e3");
  assert.equal(core.searchMatches(values, "chiikawa 日語"), false);
  assert.equal(core.searchMatches(values, "chiikawa japanese"), true);
  assert.equal(core.searchMatches(values, "人魚島 秘密"), true);
  assert.equal(core.searchMatches(values, "imax laser"), true);
});

test("home sorting stays movie-first with release, title and activity ordering", async () => {
  const core = await loadCore();
  const items = [
    { title: "B", defaultOrder: 1, lastViewedAt: 10, favoritedAt: 5 },
    { title: "A", defaultOrder: 2, lastViewedAt: 20, favoritedAt: 30 }
  ];

  assert.equal([...items].sort((a, b) => core.compareItems(a, b, "default"))[0].title, "B");
  assert.equal([...items].sort((a, b) => core.compareItems(a, b, "title"))[0].title, "A");
  assert.equal([...items].sort((a, b) => core.compareItems(a, b, "recent"))[0].title, "A");
  assert.equal([...items].sort((a, b) => core.compareItems(a, b, "favorites"))[0].title, "A");

  const dated = [
    { title: "Soon", releaseDate: "2026-08-10", defaultOrder: 1 },
    { title: "New", releaseDate: "2026-08-12", defaultOrder: 2 }
  ];
  assert.equal([...dated].sort((a, b) => core.compareItems(a, b, "release-newest"))[0].title, "New");
  assert.equal([...dated].sort((a, b) => core.compareItems(a, b, "release-soonest"))[0].title, "Soon");
});

test("movie-first search, favorites and recent activity stay wired", async () => {
  const [index, app, multiProvider, library, styles] = await Promise.all([
    source("app/index.html"),
    source("app/app.js"),
    source("app/multi-provider.js"),
    source("app/home-library.js"),
    source("app/home-library.css")
  ]);

  assert.ok(index.indexOf("home-library-core.js?v=8e3") < index.indexOf("home-library.js?v=8e3"));
  assert.ok(index.indexOf("multi-provider.js?v=8e2") < index.indexOf("home-library-core.js?v=8e3"));
  assert.match(app, /data-movie-favorite/);
  assert.match(multiProvider, /HKCinemaHomeLibrary/);
  assert.match(library, /placeholder="搜尋電影"/);
  assert.match(library, /data-home-movie-search/);
  assert.match(library, /data-home-library-view/);
  assert.match(library, /data-home-recent-clear/);
  assert.match(library, /homeLanguages/);
  assert.match(library, /version: "8e3"/);
  assert.doesNotMatch(library, /data-home-region/);
  assert.doesNotMatch(library, /data-home-facet/);
  assert.doesNotMatch(library, /HKCinemaHomeProviderFilters/);
  assert.doesNotMatch(library, /providerVisible/);
  assert.doesNotMatch(library, /provider-compare-filters:v1/);
  assert.doesNotMatch(library, /<option value="providers">/);
  assert.match(styles, /\.movie-favorite-button/);
});

test("catalogue and detail metadata continue feeding movie aggregates", async () => {
  const [app, multiProvider, mclDetail, health, style, providerStyle, compare, library] = await Promise.all([
    source("app/app.js"),
    source("app/multi-provider.js"),
    source("app/mcl-detail.js"),
    source("app/data-health.js"),
    source("app/home-library.css"),
    source("app/multi-provider.css"),
    source("app/provider-compare-v4.js"),
    source("app/home-library.js")
  ]);

  assert.match(app, /data-home-languages/);
  assert.match(app, /data-home-formats/);
  assert.match(app, /hkcinema:home-tab/);
  assert.match(multiProvider, /mergeMovieMetadata/);
  assert.match(multiProvider, /hkcinema:movie-metadata/);
  assert.match(multiProvider, /HKCinemaMovieGroups/);
  assert.match(mclDetail, /reportMovieMetadata/);
  assert.match(health, /syncRefreshButton/);
  assert.match(style, /\.home-library-tools\.is-stuck/);
  assert.doesNotMatch(providerStyle, /\.home-provider-filters/);
  assert.match(providerStyle, /\.movie-group-member/);
  assert.match(compare, /hkcinema:provider-compare-open/);
  assert.doesNotMatch(library, /restoreRegionPreferenceToCompare/);
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
