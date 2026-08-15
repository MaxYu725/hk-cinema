import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  buildCineArtSessionBookingUrl,
  createCineArtShowtimeService
} from "../worker/src/providers/cineart-showtimes.js";
import { assertAsset, assertAssetOrder } from "./index-assets.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const CACHE_URL = "https://hk-cinema.internal/cache/m7p1f/cineart/showtimes?layer=fresh";
const NOW_MS = Date.parse("2026-08-15T12:00:00.000Z");

test("M10T1B builds the exact official CineArt show route only from a valid show id", () => {
  assert.equal(
    buildCineArtSessionBookingUrl("1010516"),
    "https://cinearthouse.com.hk/hk/show/1010516"
  );
  assert.equal(
    buildCineArtSessionBookingUrl("cineart:1010516"),
    "https://cinearthouse.com.hk/hk/show/1010516"
  );
  assert.equal(buildCineArtSessionBookingUrl(""), null);
  assert.equal(buildCineArtSessionBookingUrl("not-a-show"), null);
  assert.equal(buildCineArtSessionBookingUrl("101/0516"), null);
});

test("M10T1B rehydrates exact booking links for pre-existing CineArt edge snapshots", async () => {
  const cachedSnapshot = {
    provider: "cineart",
    sessions: [{
      sourceId: "1010516",
      provider: "cineart",
      movieSourceId: "799",
      cinema: { sourceId: "8", name: { zh: "CineArt 測試戲院" } },
      house: { sourceId: "3", name: "3院" },
      date: "2026-08-15",
      time: "20:30",
      startAt: "2026-08-15T12:30:00.000Z",
      languages: ["粵語"],
      subtitles: ["中文字幕"],
      formats: ["2D"],
      price: null,
      seatSummary: null,
      bookingUrl: null
    }],
    meta: {
      provider: "cineart",
      updatedAt: "2026-08-15T11:59:00.000Z"
    }
  };
  const cache = {
    async match(request) {
      if (request.url !== CACHE_URL) return null;
      return new Response(JSON.stringify(cachedSnapshot), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    },
    async put() {
      throw new Error("fresh cached path must not write");
    }
  };
  let fetchCalls = 0;
  const service = createCineArtShowtimeService({
    cache,
    now: () => NOW_MS,
    detailEnrichment: false,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("network must not run on fresh cache hit");
    }
  });

  const movie = await service.getMovie("799", "2026-08-15");
  assert.equal(fetchCalls, 0);
  assert.equal(movie.meta.cacheState, "fresh-edge");
  assert.equal(movie.sessions.length, 1);
  assert.equal(movie.sessions[0].sourceId, "1010516");
  assert.equal(
    movie.sessions[0].bookingUrl,
    "https://cinearthouse.com.hk/hk/show/1010516"
  );
  assert.equal(
    movie.allSessions[0].bookingUrl,
    "https://cinearthouse.com.hk/hk/show/1010516"
  );
});

test("M10T1B exposes CineArt booking through the Registry and provider-owned comparison adapter", async () => {
  const [registrySource, adapterSource, index] = await Promise.all([
    read("app/provider-registry.js"),
    read("app/providers/cineart.js"),
    read("app/index.html")
  ]);
  const context = { window: {} };
  vm.runInNewContext(registrySource, context);
  const registry = context.window.HKCinemaProviderRegistry;

  assert.equal(registry.hasCapability("cineart", "booking"), true);
  assert.match(adapterSource, /bookingUrl:\s*session\?\.bookingUrl\s*\|\|\s*null/);
  assert.doesNotMatch(adapterSource, /cinearthouse\.com\.hk/);
  assertAsset(index, "provider-registry.js");
  assertAsset(index, "providers/cineart.js");
  assertAssetOrder(index, "provider-registry.js", "providers/cineart.js");
});
