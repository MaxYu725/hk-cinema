import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  CINEART_CATALOGUE_CONFIG,
  createCineArtCatalogueService,
  normalizeCineArtCatalogue
} from "../worker/src/providers/cineart-catalogue.js";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

function flightHtml(props) {
  const flight = `12:${JSON.stringify({ lng: "hk", ...props })}\n`;
  return `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
}

const NOW = Date.parse("2026-08-12T12:00:00Z");
const HOME_PROPS = {
  movies: [
    {
      id: 700,
      active: true,
      openingDate: "2026-08-01T00:00:00.000Z",
      title_lang: JSON.stringify({ zh_hk: "上映電影", en: "Now Movie" }),
      duration: 125,
      dialect_lang: JSON.stringify({ zh_hk: "英語" }),
      subtitle_lang: JSON.stringify({ zh_hk: "中文字幕" }),
      images: ["poster/now.jpg"]
    },
    {
      id: 701,
      active: true,
      openingDate: "2026-08-20T00:00:00.000Z",
      title_lang: JSON.stringify({ zh_hk: "未來電影", en: "Coming Movie" }),
      duration: 110,
      images: ["https://media.grabticks.com/poster/coming.jpg"]
    },
    {
      id: 702,
      active: true,
      openingDate: "2026-07-01T00:00:00.000Z",
      title: "Old Movie",
      images: []
    }
  ],
  shows: [
    {
      id: 9000,
      published: true,
      hold: false,
      date: "2026-08-12T00:00:00.000Z",
      movie: { id: 700 }
    }
  ],
  showSites: [{ id: 16 }],
  houseList: [{ id: 50 }]
};

function memoryCache() {
  const values = new Map();
  return {
    async match(request) {
      const response = values.get(request.url);
      return response ? response.clone() : undefined;
    },
    async put(request, response) {
      values.set(request.url, response.clone());
    },
    values
  };
}

test("M7C normalizes current CineArt catalogue and excludes old movies without live shows", () => {
  const catalogue = normalizeCineArtCatalogue(HOME_PROPS, { nowMs: NOW });
  assert.deepEqual(catalogue.now.map(movie => movie.sourceId), ["700"]);
  assert.deepEqual(catalogue.coming.map(movie => movie.sourceId), ["701"]);
  assert.equal(catalogue.now[0].title.zh, "上映電影");
  assert.equal(catalogue.now[0].title.en, "Now Movie");
  assert.equal(catalogue.now[0].durationMinutes, 125);
  assert.deepEqual(catalogue.now[0].language, ["英語"]);
  assert.deepEqual(catalogue.now[0].subtitles, ["中文字幕"]);
  assert.equal(catalogue.now[0].poster, "https://media.grabticks.com/poster/now.jpg");
  assert.equal(catalogue.coming[0].poster, "https://media.grabticks.com/poster/coming.jpg");
  assert.equal(catalogue.meta.counts.sourceMovies, 3);
  assert.equal(catalogue.meta.counts.sourceShows, 1);
});

test("M7C catalogue service uses one live home request, fresh edge cache, then stale fallback", async () => {
  const cache = memoryCache();
  let fetchCount = 0;
  let failUpstream = false;
  let nowMs = NOW;
  const fetchImpl = async () => {
    fetchCount += 1;
    if (failUpstream) throw new TypeError("upstream down");
    return new Response(flightHtml(HOME_PROPS), { status: 200 });
  };
  const waits = [];
  const ctx = { waitUntil(promise) { waits.push(promise); } };
  const service = createCineArtCatalogueService({
    fetchImpl,
    cache,
    now: () => nowMs
  });

  const network = await service.get({ ctx });
  assert.equal(network.meta.cacheState, "network");
  assert.equal(fetchCount, 1);
  assert.equal(waits.length, 1);
  await Promise.all(waits);

  const fresh = await service.get();
  assert.equal(fresh.meta.cacheState, "fresh-edge");
  assert.equal(fetchCount, 1);

  for (const key of [...cache.values.keys()]) {
    if (key.includes("layer=fresh")) cache.values.delete(key);
  }
  failUpstream = true;
  nowMs += 2 * 60 * 1000;
  const stale = await service.get();
  assert.equal(stale.meta.cacheState, "stale-edge");
  assert.equal(stale.meta.stale, true);
  assert.match(stale.meta.upstreamError, /upstream down/);
  assert.equal(fetchCount, 2);
});

test("M7C registers CineArt with catalogue only until the showtime adapter is wired", async () => {
  const registrySource = await read("app/provider-registry.js");
  const context = { window: {} };
  vm.runInNewContext(registrySource, context);
  const registry = context.window.HKCinemaProviderRegistry;
  const cineart = registry.get("cineart");

  assert.equal(registry.version, "m7c-1");
  assert.equal(cineart.displayName, "CineArt");
  assert.deepEqual(JSON.parse(JSON.stringify(cineart.capabilities)), {
    catalogue: true,
    showtimes: false,
    prices: false,
    seatSummary: false,
    seatMap: false,
    booking: false
  });
});

test("M7C generic catalogue extension gates home cards on catalogue + showtimes without a CineArt branch", async () => {
  const extension = await read("app/multi-provider-registry-extension.js");
  assert.match(extension, /capabilities\?\.catalogue === true/);
  assert.match(extension, /capabilities\?\.showtimes === true/);
  assert.match(extension, /hkcinema:provider-catalogue/);
  assert.doesNotMatch(extension, /providerId === ["']cineart["']/);
  assert.doesNotMatch(extension, /providerId !== ["']cineart["']/);
});

test("M7C production load order installs CineArt adapter before health loader and shared home extension", async () => {
  const index = await read("app/index.html");
  const registry = index.indexOf("provider-registry.js?v=m7c-1");
  const provider = index.indexOf("providers/cineart.js?v=m7c-1");
  const extension = index.indexOf("multi-provider-registry-extension.js?v=m7c-1");
  const status = index.indexOf("cineart-status.js?v=m7c-1");

  assert.ok(registry >= 0 && registry < provider);
  assert.ok(provider < extension);
  assert.ok(extension < status);
});

test("M7C cache policy remains short-lived and source reads stay bounded", () => {
  assert.equal(CINEART_CATALOGUE_CONFIG.homeUrl, "https://cinearthouse.com.hk/hk");
  assert.equal(CINEART_CATALOGUE_CONFIG.timeoutMs, 4500);
  assert.equal(CINEART_CATALOGUE_CONFIG.maxBytes, 4 * 1024 * 1024);
  assert.equal(CINEART_CATALOGUE_CONFIG.freshTtlSeconds, 60);
  assert.equal(CINEART_CATALOGUE_CONFIG.staleTtlSeconds, 30 * 60);
});
