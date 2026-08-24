import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { assertAsset, assertAssetOrder } from "./index-assets.mjs";
import emperorWorker from "../worker/src/index-emperor.js";

const ROOT = new URL("../", import.meta.url);
const APP = new URL("../app/", import.meta.url);
const RETIRED = [
  "app/movie-detail-shared.js",
  "app/movie-detail-shared.css",
  "app/mcl-detail.js",
  "app/mcl-detail.css",
  "app/emperor-detail.js",
  "app/emperor-detail.css",
  "app/classic-final-ui-polish.js",
  "app/classic-final-ui-polish.css",
  "app/phase9b2-classic-mobile-polish.css",
  "app/phase9b3-date-filter-ux.css",
  "app/phase9d0-home-sticky-scroll.js",
  "app/phase9d0-home-sticky-scroll.css",
  "app/phase10r3a-mobile-shell-date-strip.js",
  "app/phase10r3a-mobile-shell-date-strip.css",
  "worker/src/providers/emperor-detail.js"
];

const read = path => readFile(new URL(path, ROOT), "utf8");

test("C2 leaves one fixed Metro runtime and ignores the retired skin query", async () => {
  const [index, theme, metro] = await Promise.all([
    read("app/index.html"),
    read("app/theme-foundation.css"),
    read("app/metro-runtime.js")
  ]);

  assert.match(index, /<html lang="zh-HK" data-skin="metro">/);
  assert.doesNotMatch(index, /URLSearchParams|skin=classic|applySkin/);
  assert.doesNotMatch(theme, /data-skin="classic"/);
  assert.doesNotMatch(metro, /dataset\.skin\s*!==\s*"metro"/);
  assertAssetOrder(index, "theme-foundation.css", "metro-theme.css", "metro-m3-comparison.css");
});

test("C2 removes retired source files and all Classic-only production selectors", async () => {
  for (const path of RETIRED) await assert.rejects(access(new URL(path, ROOT)));

  const cssFiles = (await readdir(APP, { recursive: true }))
    .filter(path => path.endsWith(".css"));
  const css = (await Promise.all(cssFiles.map(path => read(`app/${path}`)))).join("\n");
  assert.doesNotMatch(css, /data-skin="classic"|classic-final-/i);
});

test("movie cards have one direct comparison interaction without a duplicate detail request", async () => {
  const [index, renderer, navigation, layout, layoutStyle, sharedCore] = await Promise.all([
    read("app/index.html"),
    read("app/multi-provider.js"),
    read("app/phase8a-movie-navigation.js"),
    read("app/phase8b-comparison-layout.js"),
    read("app/phase8b-comparison-layout.css"),
    read("app/provider-shared-core.js")
  ]);

  assert.match(renderer, /aria-label="比較 \$\{escapeHtml\(displayTitle\)\} 院線場次"/);
  assert.doesNotMatch(renderer, /state\.detail|loadMovieShows|openMovieCard|HKCinemaMovieDetail/);
  assert.match(navigation, /window\.HKCinemaProviderCompare\?\.open\?\.\(aggregate\.id\)/);
  assert.match(navigation, /window\.addEventListener\("click",[\s\S]*stopImmediatePropagation\(\)[\s\S]*}, true\)/);
  assert.doesNotMatch(index, /movie-detail-shared|mcl-detail|emperor-detail/);
  assert.doesNotMatch(`${layout}\n${layoutStyle}`, /phase8b-movie-details|data-phase8b-movie-details/);
  assert.doesNotMatch(sharedCore, /detailProvider|data-detail-provider/);
});

test("seat maps and PWA back navigation now consume comparison cards only", async () => {
  const [broadway, mcl, emperor, back] = await Promise.all([
    read("app/seatmap.js"),
    read("app/mcl-seatmap.js"),
    read("app/emperor-seatmap.js"),
    read("app/pwa-back-navigation.js")
  ]);

  for (const adapter of [broadway, mcl, emperor]) {
    assert.doesNotMatch(adapter, /HKCinemaMovieDetail|showtime-card|data-detail-provider/);
    assert.match(adapter, /provider-compare-show/);
  }
  assert.match(back, /providerCompareOverlay:\s*"compare"/);
  assert.match(back, /sharedSeatMapOverlay:\s*"seatmap"/);
  assert.doesNotMatch(back, /movieDetailOverlay|"detail"|HKCinemaMovieDetail/);
});

test("shared controls and selected-date centering have neutral owners", async () => {
  const [index, controls, dateScroll] = await Promise.all([
    read("app/index.html"),
    read("app/shared-final-controls.js"),
    read("app/comparison-date-scroll.js")
  ]);

  assertAsset(index, "comparison-date-scroll.js");
  assert.match(controls, /className = "shared-tab-count"/);
  assert.match(controls, /className = "shared-sort-control"/);
  assert.match(controls, /data-shared-sort-select/);
  assert.doesNotMatch(controls, /classic/i);
  assert.match(dateScroll, /function centerSelectedDate\(\)/);
  assert.doesNotMatch(dateScroll, /dataHealth|dataset\.skin|classic/i);
});

test("the orphan Emperor detail route is gone while showtime routing remains", async () => {
  const [worker, matrix, sw] = await Promise.all([
    read("worker/src/router.js"),
    read("docs/provider-matrix.md"),
    read("app/sw.js")
  ]);

  assert.doesNotMatch(worker, /emperor-detail|getEmperorMovieDetail|\/detail\$/);
  assert.match(worker, /\/shows\$/);
  assert.doesNotMatch(matrix, /\/api\/emperor\/movies\/\{filmUniqueId\}\/detail/);
  assert.match(sw, /CACHE_NAME = `\$\{CACHE_PREFIX\}c5-1`/);
});

test("the retired Emperor detail URL now falls through to the API 404 contract", async () => {
  const response = await emperorWorker.fetch(
    new Request("https://example.test/api/emperor/movies/12345/detail"),
    {},
    { waitUntil() {} }
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Endpoint not found"
    }
  });
});
