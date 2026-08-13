import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assetPosition, assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function fixtures() {
  return JSON.parse(await source("tests/fixtures/phase7b-view-models.json"));
}

async function loadRenderer() {
  const window = {};
  const document = {
    activeElement: null,
    addEventListener() {},
    querySelector() { return null; },
    createElement() {
      return {
        set innerHTML(value) {
          this.textContent = String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        },
        textContent: ""
      };
    }
  };
  const context = vm.createContext({ console, document, Intl, window });
  vm.runInContext(await source("app/provider-registry.js"), context, { filename: "provider-registry.js" });
  vm.runInContext(await source("app/showtime-metadata.js"), context, { filename: "showtime-metadata.js" });
  vm.runInContext(await source("app/view-models.js"), context, { filename: "view-models.js" });
  vm.runInContext(await source("app/movie-detail-shared.js"), context, { filename: "movie-detail-shared.js" });
  return window.HKCinemaMovieDetail;
}

function shows(session) {
  return {
    availableDates: [session.date, "2026-08-11"],
    selectedDate: session.date,
    sessions: [session]
  };
}

test("Phase 7B part 2 renders all providers through one detail structure", async () => {
  const [renderer, data] = await Promise.all([loadRenderer(), fixtures()]);
  const inputs = {
    broadway: { movie: data.broadway.movie, shows: shows(data.broadway.showtime) },
    mcl: { movie: data.mcl.movie, shows: shows(data.mcl.showtime) },
    emperor: { movie: data.emperor.movie, detail: data.emperor.detail, shows: shows(data.emperor.showtime) }
  };

  for (const [providerId, input] of Object.entries(inputs)) {
    const html = renderer.renderHtml(renderer.createView({ providerId, ...input }));
    assert.match(html, new RegExp(`class="shared-movie-detail" data-detail-provider="${providerId}"`));
    assert.match(html, /class="detail-hero shared-detail-hero"/);
    assert.match(html, /<section class="detail-showtimes"/);
    assert.match(html, /<h2>場次<\/h2>/);
    assert.match(html, /data-detail-date="2026-08-10"/);
    assert.match(html, new RegExp(`data-detail-provider="${providerId}"`));
  }
});

test("shared facts hide missing values while keeping rich provider detail", async () => {
  const [renderer, data] = await Promise.all([loadRenderer(), fixtures()]);
  const mclHtml = renderer.renderHtml(renderer.createView({
    providerId: "mcl",
    movie: data.mcl.movie,
    shows: shows(data.mcl.showtime)
  }));
  const emperorHtml = renderer.renderHtml(renderer.createView({
    providerId: "emperor",
    movie: data.emperor.movie,
    detail: data.emperor.detail,
    shows: shows(data.emperor.showtime)
  }));

  assert.doesNotMatch(mclHtml, /shared-detail-facts/);
  assert.doesNotMatch(mclHtml, /未提供/);
  assert.match(emperorHtml, /<dt>片長<\/dt><dd>115 分鐘<\/dd>/);
  assert.match(emperorHtml, /<dt>級別<\/dt><dd>IIB<\/dd>/);
  assert.match(emperorHtml, /<strong>導演<\/strong>/);
  assert.match(emperorHtml, /Marvel 第一家庭踏上新的冒險。/);
});

test("shared showtime cards separate seat-map and official booking actions", async () => {
  const [renderer, data] = await Promise.all([loadRenderer(), fixtures()]);
  const broadwayHtml = renderer.renderHtml(renderer.createView({
    providerId: "broadway",
    movie: data.broadway.movie,
    shows: shows(data.broadway.showtime)
  }));
  const mclHtml = renderer.renderHtml(renderer.createView({
    providerId: "mcl",
    movie: data.mcl.movie,
    shows: shows(data.mcl.showtime)
  }));
  const emperorHtml = renderer.renderHtml(renderer.createView({
    providerId: "emperor",
    movie: data.emperor.movie,
    detail: data.emperor.detail,
    shows: shows(data.emperor.showtime)
  }));

  for (const html of [broadwayHtml, mclHtml, emperorHtml]) {
    assert.match(html, /<article\s+class="showtime-card shared-showtime-card/);
    assert.doesNotMatch(html, /<a\s+class="showtime-card/);
    assert.match(html, /data-booking-url=/);
    assert.match(html, /class="seat-pill shared-seatmap-button">查看座位<\/button>/);
    assert.match(html, /class="shared-booking-button"[^>]*>官方購票<\/a>/);
  }
  assert.match(broadwayHtml, /30\/115 可選/);
  assert.match(mclHtml, /約 72% 已售/);
  assert.match(mclHtml, /成人 \$105 · 學生 \$90 · 小童 \$80 · 長者 \$80/);
  assert.match(emperorHtml, /30\/80 未售/);
  assert.match(emperorHtml, /票面 \$120 · 手續費 \$10 · 最低 \$110/);
});

test("shared detail renderer owns loading, error and truthful fallback states", async () => {
  const [renderer, data] = await Promise.all([loadRenderer(), fixtures()]);
  const loading = renderer.renderHtml(renderer.createView({
    providerId: "mcl",
    movie: data.mcl.movie,
    showtimesLoading: true
  }));
  const failed = renderer.renderHtml(renderer.createView({
    providerId: "mcl",
    movie: data.mcl.movie,
    showtimesError: "MCL upstream unavailable"
  }));
  const empty = renderer.renderHtml(renderer.createView({
    providerId: "mcl",
    movie: data.mcl.movie
  }));

  assert.match(loading, /正在載入 MCL 場次/);
  assert.match(failed, /暫時無法取得 MCL 場次/);
  assert.match(failed, /data-detail-retry/);
  assert.match(empty, /暫時沒有可售場次/);
  assert.doesNotMatch(empty, /\d+\/\d+ 可選/);
});

test("all provider loaders delegate markup to the shared renderer", async () => {
  const [index, app, mcl, emperor, seatmap, css, visual] = await Promise.all([
    source("app/index.html"),
    source("app/app.js"),
    source("app/mcl-detail.js"),
    source("app/emperor-detail.js"),
    source("app/emperor-seatmap.js"),
    source("app/movie-detail-shared.css"),
    source("tests/movie-detail-shared-visual.html")
  ]);

  for (const loader of [app, mcl, emperor]) {
    assert.match(loader, /HKCinemaMovieDetail\?\.render/);
    assert.doesNotMatch(loader, /function renderSession/);
    assert.doesNotMatch(loader, /<div class="detail-hero/);
  }
  assertAsset(index, "view-models.js");
  assertAsset(index, "movie-detail-shared.js");
  const modelIndex = assetPosition(index, "view-models.js");
  const rendererIndex = assetPosition(index, "movie-detail-shared.js");
  assert.ok(rendererIndex > modelIndex);
  for (const loader of ["app.js", "mcl-detail.js", "emperor-detail.js"]) {
    assertAsset(index, loader);
    assert.ok(rendererIndex < assetPosition(index, loader), `${loader} must load after the shared renderer`);
  }
  assertAsset(index, "movie-detail-shared.css");
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(seatmap, /HKCinemaMovieDetail\?\.showtimeFor/);
  for (const provider of ["broadway", "mcl", "emperor"]) {
    assert.match(visual, new RegExp(`data-provider="${provider}"`));
  }
});

test("Broadway detail ignores superseded requests after close or movie changes", async () => {
  const app = await source("app/app.js");

  assert.match(app, /detail:\s*\{[\s\S]*generation:\s*0,[\s\S]*controller:\s*null/);
  assert.match(app, /state\.detail\.controller\?\.abort\("close"\)/);
  assert.match(app, /state\.detail\.controller\?\.abort\("superseded"\)/);
  assert.match(app, /if \(sourceId !== previousSourceId\) state\.detail\.data = null/);
  assert.match(app, /signal:\s*controller\.signal/);
  assert.match(app, /generation !== state\.detail\.generation \|\| controller\.signal\.aborted/);
  assert.match(app, /if \(generation === state\.detail\.generation\) \{[\s\S]*state\.detail\.loading = false/);
});

test("MCL metadata preserves the earliest ticketing date as the catalogue fallback", async () => {
  const events = [];
  const ticketing = {
    availableDates: ["2026-08-12", "2026-08-10", "2026-08-11"],
    sessions: []
  };
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const window = {
    HKCinemaProviders: { mcl: { getTicketing: async () => ticketing } },
    HKCinemaViewModels: { showtime: () => null },
    HKCinemaMovieDetail: { render() {} },
    addEventListener() {},
    dispatchEvent(event) { events.push(event); }
  };
  const document = { addEventListener() {} };
  vm.runInContext(
    await source("app/mcl-detail.js"),
    vm.createContext({ console, CustomEvent, document, window }),
    { filename: "mcl-detail.js" }
  );

  await window.HKCinemaMCLDetail.load({ sourceId: "mcl:19216", releaseDate: null });
  assert.equal(events.at(-1).detail.releaseDate, "2026-08-10");

  await window.HKCinemaMCLDetail.load({ sourceId: "mcl:19216", releaseDate: "2026-08-15" });
  assert.equal(events.at(-1).detail.releaseDate, "2026-08-15");
});
