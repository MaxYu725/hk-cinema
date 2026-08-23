import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { assertAsset } from "./index-assets.mjs";

const ROOT = new URL("../", import.meta.url);
const source = path => readFile(new URL(path, ROOT), "utf8");

function registryWithFixture() {
  const providers = [
    {
      id: "broadway",
      displayName: "Broadway",
      healthLabel: "Broadway",
      capabilities: { catalogue: true, showtimes: true, prices: true, seatSummary: true, seatMap: true, booking: true }
    },
    {
      id: "mcl",
      displayName: "MCL",
      healthLabel: "MCL",
      capabilities: { catalogue: true, showtimes: true, prices: true, seatSummary: true, seatMap: true, booking: true }
    },
    {
      id: "emperor",
      displayName: "Emperor Cinemas",
      healthLabel: "Emperor",
      capabilities: { catalogue: true, showtimes: true, prices: true, seatSummary: true, seatMap: true, booking: true }
    },
    {
      id: "fixture",
      displayName: "Fixture Cinema",
      healthLabel: "Fixture",
      capabilities: { catalogue: true, showtimes: true, prices: false, seatSummary: false, seatMap: false, booking: true }
    }
  ];
  const byId = new Map(providers.map(provider => [provider.id, Object.freeze(provider)]));
  return Object.freeze({
    providers: Object.freeze(providers),
    get(id) { return byId.get(String(id || "").trim().toLowerCase()) || null; },
    hasCapability(id, capability) { return Boolean(this.get(id)?.capabilities?.[capability]); }
  });
}

async function loadRuntime() {
  const document = {
    activeElement: null,
    body: null,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return {
        set innerHTML(value) {
          this.textContent = String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        },
        textContent: ""
      };
    }
  };
  const window = {
    HKCinemaProviderRegistry: registryWithFixture(),
    innerWidth: 390,
    addEventListener() {},
    dispatchEvent() {}
  };
  class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  }
  const context = vm.createContext({
    AbortController,
    clearTimeout,
    console,
    CustomEvent,
    document,
    Intl,
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    window
  });
  for (const path of [
    "app/showtime-metadata.js",
    "app/view-models.js",
    "app/seatmap-shared.js"
  ]) {
    vm.runInContext(await source(path), context, { filename: path });
  }
  return context;
}

function fixtureMovie() {
  return {
    id: "fixture:movie-1",
    sourceId: "movie-1",
    title: { zh: "第四院線測試電影", en: "Fourth Provider Fixture" },
    bookingUrl: "https://fixture.example/movie-1"
  };
}

function fixtureShowtime() {
  return {
    id: "fixture:session-1",
    sourceId: "session-1",
    date: "2026-08-13",
    time: "20:30",
    cinema: { id: "harbour", name: { zh: "Fixture Harbour Cinema" } },
    house: { id: "hall-1", name: "House 1" },
    bookingUrl: "https://fixture.example/session-1",
    price: { adult: 999, face: 999 },
    seatSummary: { total: 100, available: 50, occupiedPercent: 50 },
    purchase: {
      scheduleKey: "SHOULD-NOT-BECOME-EMPEROR",
      canPurchase: true
    }
  };
}

test("M7R3 registered fourth provider uses generic movie and showtime normalization", async () => {
  const context = await loadRuntime();
  const models = context.window.HKCinemaViewModels;
  const movie = models.movie("fixture", fixtureMovie());
  const showtime = models.showtime("fixture", fixtureShowtime());

  assert.equal(movie.provider.id, "fixture");
  assert.equal(movie.provider.label, "Fixture Cinema");
  assert.equal(movie.bookingUrl, "https://fixture.example/movie-1");
  assert.equal(showtime.provider.id, "fixture");
  assert.equal(showtime.cinema.name.display, "Fixture Harbour Cinema");
  assert.equal(showtime.price.primary, null);
  assert.equal(showtime.seats.quality, "unknown");
  assert.equal(showtime.bookingUrl, "https://fixture.example/session-1");
  assert.deepEqual(JSON.parse(JSON.stringify(showtime.seatMap)), {
    supported: false,
    layoutMode: null,
    request: null,
    reason: "unsupported"
  });
  assert.equal(models.seatMap("fixture", {
    scheduleId: "session-1",
    sections: [{ seats: [] }]
  }, fixtureShowtime()), null);
});

test("M7R3 shared seat-map capability gate stops unsupported provider before load or adapt", async () => {
  const context = await loadRuntime();
  const shared = context.window.HKCinemaSeatMapShared;
  let loadCalls = 0;
  let adaptCalls = 0;

  const opened = await shared.open({
    provider: "fixture",
    key: "session-1",
    async load() {
      loadCalls += 1;
      return {};
    },
    adapt() {
      adaptCalls += 1;
      return null;
    }
  });

  assert.equal(opened, false);
  assert.equal(loadCalls, 0);
  assert.equal(adaptCalls, 0);

  const classes = new Set();
  const node = {
    classList: { add(...names) { names.forEach(name => classes.add(name)); } },
    dataset: {},
    setAttribute() {}
  };
  assert.equal(shared.prepareTrigger(node, { provider: "fixture", label: "查看座位" }), null);
  assert.equal(classes.size, 0);
  assert.equal(node.dataset.seatmapProvider, undefined);
});

test("M7R3 shared model and seat-map runtimes remain independently cache-busted", async () => {
  const [index, models, seatmap] = await Promise.all([
    source("app/index.html"),
    source("app/view-models.js"),
    source("app/seatmap-shared.js")
  ]);

  for (const script of ["view-models.js", "seatmap-shared.js"]) {
    assertAsset(index, script);
  }
  assert.match(models, /unsupportedSeatMap\("unsupported"\)/);
  assert.match(models, /const SEAT_MAP_REQUEST_BUILDERS = Object\.freeze/);
  assert.match(models, /HKCinemaProviders\?\.\[providerId\]\?\.seatMapRequest/);
  assert.match(models, /HKCinemaProviders\?\.\[info\.id\]\?\.viewModels/);
  assert.doesNotMatch(models, /if\s*\(providerId\s*===\s*"(?:broadway|mcl|emperor)"\)/);
  assert.match(models, /unsupportedSeatMap\("adapter-missing"\)/);
  assert.doesNotMatch(models, /Unsupported cinema provider/);
  assert.doesNotMatch(seatmap, /Unsupported seat-map provider/);
});
