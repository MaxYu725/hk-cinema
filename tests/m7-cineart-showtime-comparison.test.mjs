import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CINEART_SHOWTIME_CONFIG,
  createCineArtShowDetailService,
  createCineArtShowtimeService,
  normalizeCineArtShowDetail,
  normalizeCineArtShowtimeSnapshot,
  selectCineArtMovieShows
} from "../worker/src/providers/cineart-showtimes.js";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");
const NOW = Date.parse("2026-08-12T12:00:00Z");

function flightHtml(props) {
  const flight = `12:${JSON.stringify({ lng: "hk", ...props })}\n`;
  return `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
}

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

const HOME_PROPS = {
  movies: [
    {
      id: 778,
      title: "測試電影",
      dialect_lang: JSON.stringify({ zh_hk: "英語" }),
      subtitle_lang: JSON.stringify({ zh_hk: "中文字幕" })
    },
    { id: 779, title: "另一電影" }
  ],
  showSites: [
    {
      id: 16,
      code: "MB",
      name: "CineArt (MegaBox)",
      name_lang: { zh_hk: "影藝戲院 (MegaBox)", en: "CineArt (MegaBox)" }
    }
  ],
  houseList: [{ id: 44, name: "House 1" }],
  shows: [
    {
      id: 80441,
      published: true,
      hold: false,
      date: "2026-08-12T00:00:00.000Z",
      time: "2026-08-12T12:15:00.000Z",
      price: 110,
      seats: 56,
      sold: 36,
      avaliable: 20,
      movie: { id: 778 },
      site: { id: 16 },
      house: { id: 44 }
    },
    {
      id: 80442,
      published: true,
      hold: false,
      date: "2026-08-13T00:00:00.000Z",
      time: "2026-08-13T02:30:00.000Z",
      price: 120,
      seats: 56,
      sold: 10,
      avaliable: 46,
      movie: { id: 778 },
      site: { id: 16 },
      house: { id: 44 }
    },
    {
      id: 90000,
      published: true,
      hold: false,
      date: "2026-08-12T00:00:00.000Z",
      time: "2026-08-12T13:00:00.000Z",
      price: 90,
      seats: 56,
      sold: 1,
      avaliable: 55,
      movie: { id: 779 },
      site: { id: 16 },
      house: { id: 44 }
    }
  ]
};

const DETAIL_PROPS = {
  showId: "80441",
  showDetail: {
    show: {
      id: 80441,
      price: 110,
      movie: { id: 778 },
      ticketPrice: {
        id: 300,
        ticketTypes: [
          { active: true, online: true, name: "成人 Adult", price: 110, concession: false },
          { active: true, online: true, name: "學生 Student", price: 95, concession: true },
          { active: true, online: true, name: "小童 Child", price: 80, concession: true },
          { active: true, online: true, name: "長者 Senior", price: 70, concession: true },
          { active: false, online: true, name: "Inactive", price: 1, concession: true }
        ]
      }
    }
  },
  seatStatus: {
    seats: {
      A1: "A",
      A2: "A",
      A3: "H",
      A4: "U",
      A5: "L",
      A6: "X"
    }
  }
};

test("M7D normalizes CineArt home shows without treating avaliable as selectable seats", () => {
  const snapshot = normalizeCineArtShowtimeSnapshot(HOME_PROPS, { nowMs: NOW });
  assert.equal(snapshot.sessions.length, 3);
  const session = snapshot.sessions.find(item => item.sourceId === "80441");

  assert.equal(session.movieSourceId, "778");
  assert.equal(session.date, "2026-08-12");
  assert.equal(session.time, "20:15");
  assert.equal(session.cinema.sourceId, "16");
  assert.equal(session.cinema.name.zh, "影藝戲院 (MegaBox)");
  assert.equal(session.house.name, "House 1");
  assert.equal(session.price.display, 110);
  assert.equal(session.price.currency, "HKD");
  assert.equal(session.seatSummary.quality, "coarse-not-sold");
  assert.equal(session.seatSummary.total, 56);
  assert.equal(session.seatSummary.sold, 36);
  assert.equal(session.seatSummary.coarseRemaining, 20);
  assert.equal(session.seatSummary.unknown, 20);
  assert.equal(session.seatSummary.available, null);
  assert.deepEqual(session.languages, ["英語"]);
  assert.deepEqual(session.subtitles, ["中文字幕"]);
  assert.equal(session.bookingUrl, null);
});

test("M7D missing upstream numerics stay unknown instead of becoming zero", () => {
  const props = {
    ...HOME_PROPS,
    shows: [{
      id: 91000,
      published: true,
      hold: false,
      date: "2026-08-12T00:00:00.000Z",
      time: "2026-08-12T14:00:00.000Z",
      price: null,
      seats: null,
      sold: undefined,
      avaliable: "",
      movie: { id: 778 },
      site: { id: 16 },
      house: { id: 44 }
    }]
  };
  const snapshot = normalizeCineArtShowtimeSnapshot(props, { nowMs: NOW });
  const session = snapshot.sessions[0];

  assert.equal(session.price, null);
  assert.equal(session.seatSummary, null);

  const detail = normalizeCineArtShowDetail({
    props: {
      showId: "91000",
      showDetail: {
        show: {
          id: 91000,
          price: null,
          movie: { id: 778 },
          ticketPrice: {
            ticketTypes: [{ active: true, online: true, name: "成人 Adult", price: null }]
          }
        }
      },
      seatStatus: { seats: {} }
    }
  }, { nowMs: NOW });
  assert.equal(detail.price?.display ?? null, null);
  assert.equal(detail.price?.adult ?? null, null);
  assert.equal(detail.seatSummary, null);
});

test("M7D movie show selection exposes stable dates, show IDs and requested date sessions", () => {
  const snapshot = normalizeCineArtShowtimeSnapshot(HOME_PROPS, { nowMs: NOW });
  const result = selectCineArtMovieShows(snapshot, "778", "2026-08-13");

  assert.deepEqual(result.availableDates, ["2026-08-12", "2026-08-13"]);
  assert.equal(result.selectedDate, "2026-08-13");
  assert.deepEqual(result.sessions.map(item => item.sourceId), ["80442"]);
  assert.deepEqual(result.allSessions.map(item => item.sourceId), ["80441", "80442"]);
  assert.equal(result.metadataComplete, true);
});

test("M7D showtime service uses one home GET, fresh cache, then bounded stale fallback", async () => {
  const cache = memoryCache();
  let fetchCount = 0;
  let fail = false;
  const fetchImpl = async () => {
    fetchCount += 1;
    if (fail) throw new TypeError("origin down");
    return new Response(flightHtml(HOME_PROPS), { status: 200 });
  };
  const waits = [];
  const service = createCineArtShowtimeService({
    fetchImpl,
    cache,
    now: () => NOW
  });

  const network = await service.getMovie("778", "2026-08-12", {
    ctx: { waitUntil(promise) { waits.push(promise); } }
  });
  assert.equal(network.meta.cacheState, "network");
  assert.equal(fetchCount, 1);
  await Promise.all(waits);

  const fresh = await service.getMovie("778", "2026-08-12");
  assert.equal(fresh.meta.cacheState, "fresh-edge");
  assert.equal(fetchCount, 1);

  for (const key of [...cache.values.keys()]) {
    if (key.includes("layer=fresh")) cache.values.delete(key);
  }
  fail = true;
  const stale = await service.getMovie("778", "2026-08-12");
  assert.equal(stale.meta.cacheState, "stale-edge");
  assert.equal(stale.meta.stale, true);
  assert.match(stale.meta.upstreamError, /origin down/);
  assert.equal(fetchCount, 2);
});

test("M7D strict detail maps A/H/U/L seats and active online ticket types", () => {
  const parsed = {
    props: DETAIL_PROPS,
    flight: `12:${JSON.stringify({ lng: "hk", ...DETAIL_PROPS })}\n`
  };
  const detail = normalizeCineArtShowDetail(parsed, { nowMs: NOW });

  assert.equal(detail.showSourceId, "80441");
  assert.equal(detail.movieSourceId, "778");
  assert.equal(detail.price.display, 110);
  assert.equal(detail.price.adult, 110);
  assert.equal(detail.price.student, 95);
  assert.equal(detail.price.child, 80);
  assert.equal(detail.price.senior, 70);
  assert.equal(detail.price.lowest, 70);
  assert.equal(detail.price.ticketTypes.length, 4);
  assert.deepEqual(detail.seatSummary, {
    quality: "strict-seat-state",
    total: 6,
    available: 2,
    held: 1,
    sold: 1,
    blocked: 1,
    unavailable: 3,
    unknown: 1,
    updatedAt: "2026-08-12T12:00:00.000Z"
  });
  assert.deepEqual(detail.seatStates, { A: 2, H: 1, U: 1, L: 1, unknown: 1 });
  assert.equal(detail.readOnly, true);
});

test("M7D lazy detail uses GET-only direct/RSC fallback and short edge cache", async () => {
  const requests = [];
  const cache = memoryCache();
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (requests.length === 1) {
      return new Response("<html><body>shell without show props</body></html>", { status: 200 });
    }
    return new Response(flightHtml(DETAIL_PROPS), {
      status: 200,
      headers: { "content-type": "text/x-component" }
    });
  };
  const waits = [];
  const service = createCineArtShowDetailService({
    fetchImpl,
    cache,
    now: () => NOW
  });

  const network = await service.get("80441", "778", {
    ctx: { waitUntil(promise) { waits.push(promise); } }
  });
  assert.equal(network.meta.cacheState, "network");
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.options.method === "GET"));
  assert.ok(requests.every(request => request.options.cache === "no-store"));
  assert.equal(requests[1].options.headers.RSC, "1");
  assert.equal(requests[1].options.headers["Next-Url"], "/hk/movie/778");
  await Promise.all(waits);

  const cached = await service.get("80441", "778");
  assert.equal(cached.meta.cacheState, "fresh-edge");
  assert.equal(requests.length, 2);
  assert.equal(cached.seatSummary.available, 2);
});

test("M7D keeps full seat map and booking disabled while lazy enrichment is bounded", async () => {
  assert.equal(CINEART_SHOWTIME_CONFIG.homeUrl, "https://cinearthouse.com.hk/hk");
  assert.equal(CINEART_SHOWTIME_CONFIG.timeoutMs, 4500);
  assert.equal(CINEART_SHOWTIME_CONFIG.maxBytes, 4 * 1024 * 1024);
  assert.equal(CINEART_SHOWTIME_CONFIG.freshTtlSeconds, 60);
  assert.equal(CINEART_SHOWTIME_CONFIG.staleTtlSeconds, 10 * 60);
  assert.equal(CINEART_SHOWTIME_CONFIG.detailTtlSeconds, 20);

  const [registry, enrichment, worker] = await Promise.all([
    read("app/provider-registry.js"),
    read("app/cineart-compare-enrichment.js"),
    read("worker/src/index-emperor-seat.js")
  ]);
  assert.match(registry, /seatMap:\s*false/);
  assert.match(registry, /booking:\s*false/);
  assert.match(enrichment, /MAX_CONCURRENT = 2/);
  assert.match(enrichment, /DETAIL_CACHE_MS = 20 \* 1000/);
  assert.match(enrichment, /hkcinema:provider-compare-lifecycle/);
  assert.match(enrichment, /\/api\/cineart\/movies\//);
  assert.match(enrichment, /\/api\/cineart\/shows\//);
  assert.match(worker, /normalized-showtimes/);
  assert.match(worker, /lazy-show-detail/);
});
