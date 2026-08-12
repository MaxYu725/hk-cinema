import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decodeCineArtFlightPayload,
  parseCineArtHomePayload,
  parseCineArtShowPayload,
  resolveCineArtFlightTextReference
} from "../worker/src/providers/cineart-flight.js";
import {
  CINEART_SOURCE_CONFIG,
  discoverCineArtDataSources,
  summarizeCineArtHome,
  summarizeCineArtShow
} from "../worker/src/providers/cineart-source.js";

const ROOT = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, ROOT), "utf8");

function flightHtml(...chunks) {
  return chunks
    .map(chunk => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`)
    .join("");
}

const HOME_PROPS = {
  lng: "hk",
  shows: [
    {
      id: 9001,
      published: true,
      hold: false,
      date: "2026-08-14T00:00:00.000Z",
      time: "2026-08-14T02:50:00.000Z",
      price: 170,
      seats: 271,
      seatsHold: 4,
      sold: 15,
      avaliable: 256,
      house: { id: 50 },
      site: { id: 16 },
      movie: { id: 733 }
    }
  ],
  movies: [
    {
      id: 733,
      openingDate: "2026-07-16T00:00:00.000Z",
      name: "The Odyssey",
      title: "The Odyssey",
      duration: 173,
      images: ["programfo_sample.jpg"]
    }
  ],
  showSites: [
    { id: 16, code: "MB", name: "CineArt (MegaBox)", name_lang: { zh_hk: "影藝戲院 (MegaBox)" } },
    { id: 17, code: "MT", name: "Cine-Art (Maritime Square)", name_lang: { zh_hk: "影藝戲院 (青衣城)" } },
    { id: 18, code: "JP", name: "CineArt (JP)", name_lang: { zh_hk: "影藝戲院(銅鑼灣JP)" } },
    { id: 19, code: "HW", name: "CineArt (Hollywood)", name_lang: { zh_hk: "影藝戲院 (荷里活)" } },
    { id: 23, code: "MO", name: "CineArt MOSTown", name_lang: { zh_hk: "影藝戲院(新港城中心)" } }
  ],
  showDates: [{ date: "2026-08-14T00:00:00.000Z" }],
  houseList: [{ id: 50, name: "House 7 / IMAX" }]
};

const PLAN_CONFIG = {
  width: 1400,
  height: 670,
  numSeats: 271,
  blocks: [{ row: "A", rows: 8, cols: 23 }]
};

const SHOW_PROPS = {
  lng: "hk",
  showId: "9001",
  showDetail: {
    show: {
      id: 9001,
      date: "2026-08-14T00:00:00.000Z",
      time: "2026-08-14T02:50:00.000Z",
      price: 170,
      seats: 271,
      seatsHold: 4,
      site: { id: 16, code: "MB" },
      movie: { id: 733, title: "The Odyssey" },
      house: { id: 50, name: "House 7 / IMAX" },
      plan: { config: "$10" },
      ticketPrice: {
        id: 302,
        ticketTypes: [
          { id: 1, active: true, online: true, name: "Adult", price: 170, concession: false },
          { id: 2, active: true, online: true, name: "Student", price: 155, concession: true }
        ]
      }
    }
  },
  seatStatus: {
    seats: {
      A1: "A",
      A2: "A",
      A3: "U"
    }
  },
  ticketClasses: [],
  seatClasses: []
};

function homeDocument() {
  const flight = `12:${JSON.stringify(HOME_PROPS)}\n`;
  const split = Math.floor(flight.length / 2);
  return flightHtml(flight.slice(0, split), flight.slice(split));
}

function showFlight() {
  const plan = JSON.stringify(PLAN_CONFIG);
  const lengthHex = Buffer.byteLength(plan, "utf8").toString(16);
  return `10:T${lengthHex},${plan}\n11:${JSON.stringify(SHOW_PROPS)}\n`;
}

test("M7B decodes split Next Flight chunks and extracts current home source props", () => {
  const decoded = decodeCineArtFlightPayload(homeDocument());
  assert.match(decoded, /"shows":/);

  const parsed = parseCineArtHomePayload(homeDocument());
  assert.equal(parsed.props.movies.length, 1);
  assert.equal(parsed.props.shows.length, 1);
  assert.equal(parsed.props.showSites.length, 5);

  const summary = summarizeCineArtHome(parsed.props, {
    nowMs: Date.parse("2026-08-12T11:00:00Z")
  });
  assert.equal(summary.movieCount, 1);
  assert.equal(summary.showCount, 1);
  assert.equal(summary.siteCount, 5);
  assert.equal(summary.showtimePriceCount, 1);
  assert.equal(summary.seatSummaryCount, 1);
  assert.deepEqual(summary.sampleShow, {
    id: 9001,
    movieId: 733,
    siteId: 16,
    houseId: 50,
    date: "2026-08-14",
    time: "2026-08-14T02:50:00.000Z",
    price: 170,
    seats: 271,
    sold: 15,
    available: 256
  });
});

test("M7B extracts show detail, ticket types, seat states and referenced seat-plan geometry", () => {
  const parsed = parseCineArtShowPayload(showFlight());
  const config = resolveCineArtFlightTextReference(parsed.flight, "$10");
  assert.equal(config.numSeats, 271);
  assert.equal(config.blocks.length, 1);

  const detail = summarizeCineArtShow(parsed);
  assert.equal(detail.showId, 9001);
  assert.equal(detail.ticketPriceRuleId, 302);
  assert.equal(detail.ticketTypeCount, 2);
  assert.equal(detail.activeOnlineTicketTypes.length, 2);
  assert.equal(detail.seatStatusCount, 3);
  assert.deepEqual(detail.seatStatusCounts, { A: 2, U: 1 });
  assert.deepEqual(detail.seatPlan, {
    resolved: true,
    numSeats: 271,
    blockCount: 1,
    width: 1400,
    height: 670
  });
  assert.equal(detail.readOnly, true);
});

test("M7B source discovery uses GET-only home/detail reads and falls back to RSC without purchase side effects", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });

    if (requests.length === 1) {
      return new Response(homeDocument(), { status: 200 });
    }
    if (requests.length === 2) {
      return new Response("<html><body>direct shell without embedded detail</body></html>", { status: 200 });
    }
    return new Response(showFlight(), {
      status: 200,
      headers: { "content-type": "text/x-component" }
    });
  };

  const result = await discoverCineArtDataSources({
    fetchImpl,
    now: () => Date.parse("2026-08-12T11:00:00Z")
  });

  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.options.method === "GET"));
  assert.ok(requests.every(request => request.options.cache === "no-store"));
  assert.equal(requests[2].options.headers.RSC, "1");
  assert.equal(requests[2].options.headers["Next-Url"], "/hk/movie/733");

  assert.deepEqual(result.capabilities, {
    catalogue: true,
    showtimes: true,
    showtimePrice: true,
    seatSummary: true,
    ticketTypes: true,
    seatMapReadOnly: true
  });
  assert.equal(result.correlation.showIdMatches, true);
});

test("M7B keeps discovery bounded to the current origin and a 4 MiB maximum response", () => {
  assert.equal(CINEART_SOURCE_CONFIG.homeUrl, "https://cinearthouse.com.hk/hk");
  assert.equal(CINEART_SOURCE_CONFIG.timeoutMs, 4500);
  assert.equal(CINEART_SOURCE_CONFIG.maxBytes, 4 * 1024 * 1024);
});

test("M7B discovery remains an explicit no-store diagnostic after M7C provider registration", async () => {
  const [workerSource, registrySource, index] = await Promise.all([
    read("worker/src/index-emperor-seat.js"),
    read("app/provider-registry.js"),
    read("app/index.html")
  ]);

  assert.match(workerSource, /\/api\/providers\/cineart\/discovery/);
  assert.match(workerSource, /cache-control": "no-store"/);
  assert.match(registrySource, /id: "cineart"/);
  assert.doesNotMatch(index, /providers\/cineart\/discovery/);
});
