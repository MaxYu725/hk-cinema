import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

async function fixtures() {
  return JSON.parse(await source("tests/fixtures/phase7b-view-models.json"));
}

async function loadViewModels() {
  const window = {};
  const context = vm.createContext({ console, window });
  vm.runInContext(await source("app/provider-registry.js"), context, {
    filename: "provider-registry.js"
  });
  vm.runInContext(await source("app/showtime-metadata.js"), context, {
    filename: "showtime-metadata.js"
  });
  vm.runInContext(await source("app/view-models.js"), context, {
    filename: "view-models.js"
  });
  return window.HKCinemaViewModels;
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

test("Phase 7B exposes one MovieDetailViewModel contract for all providers", async () => {
  const [api, data] = await Promise.all([loadViewModels(), fixtures()]);
  const broadway = json(api.movie("broadway", data.broadway.movie));
  const mcl = json(api.movie("mcl", data.mcl.movie));
  const emperor = json(api.movie("emperor", data.emperor.movie, data.emperor.detail));

  assert.deepEqual(sortedKeys(broadway), sortedKeys(mcl));
  assert.deepEqual(sortedKeys(mcl), sortedKeys(emperor));
  assert.equal(broadway.kind, "movie-detail");
  assert.equal(broadway.provider.id, "broadway");
  assert.equal(broadway.title.display, "劇場版 鬼滅之刃 無限城篇");
  assert.deepEqual(broadway.facts.languages, ["日語"]);
  assert.deepEqual(broadway.facts.subtitles, ["中文", "英文"]);
  assert.equal(mcl.facts.durationMinutes, null);
  assert.equal(mcl.availability.hasFacts, false);
  assert.equal(emperor.description, "Marvel 第一家庭踏上新的冒險。");
  assert.deepEqual(emperor.people.directors, ["麥特夏克曼"]);
  assert.deepEqual(emperor.facts.formats, ["標準版", "2D"]);
});

test("Phase 7B movie titles ignore object containers when only English text exists", async () => {
  const api = await loadViewModels();
  const movie = json(api.movie("mcl", {
    id: "mcl:english-only",
    sourceId: "english-only",
    title: { zh: null, en: "English Only" }
  }));

  assert.equal(movie.title.zh, null);
  assert.equal(movie.title.en, "English Only");
  assert.equal(movie.title.display, "English Only");
  assert.equal(movie.title.secondary, null);
});

test("Phase 7B showtime adapters preserve provider precision without inventing seats", async () => {
  const [api, data] = await Promise.all([loadViewModels(), fixtures()]);
  const broadway = json(api.showtime("broadway", data.broadway.showtime));
  const mcl = json(api.showtime("mcl", data.mcl.showtime));
  const emperor = json(api.showtime("emperor", data.emperor.showtime));

  assert.deepEqual(sortedKeys(broadway), sortedKeys(mcl));
  assert.deepEqual(sortedKeys(mcl), sortedKeys(emperor));
  assert.equal(broadway.seats.quality, "provider-summary");
  assert.equal(broadway.seats.available, 30);
  assert.equal(broadway.seats.occupiedPercent, 73.9);
  assert.equal(mcl.seats.quality, "estimated");
  assert.equal(mcl.seats.occupiedPercent, 72);
  assert.equal(mcl.seats.total, null);
  assert.equal(mcl.seats.available, null);
  assert.deepEqual(mcl.metadata.formats, ["2D"]);
  assert.deepEqual(mcl.metadata.languages, ["英語"]);
  assert.deepEqual(mcl.metadata.subtitles, ["中文字幕"]);
  assert.equal(emperor.seats.quality, "provider-summary");
  assert.equal(emperor.price.face, 120);
  assert.equal(emperor.price.serviceFee, 10);
  assert.equal(emperor.seatMap.supported, true);
  assert.equal(emperor.seatMap.request.scheduleKey, "ABCDEF0123456789");
});

test("Phase 7B distinguishes reported percentages from fractional occupancy", async () => {
  const api = await loadViewModels();
  const mcl = json(api.showtime("mcl", {
    id: "mcl:one-percent",
    sourceId: "one-percent",
    cinema: { id: "001" },
    seatSummary: { occupiedPercent: 1 }
  }));
  const broadway = json(api.showtime("broadway", {
    id: "broadway:one-percent",
    sourceId: "one-percent",
    cinema: { id: "001" },
    seatSummary: { occupancy: 0.01 }
  }));

  assert.equal(mcl.seats.occupiedPercent, 1);
  assert.equal(broadway.seats.occupiedPercent, 1);
});

test("Phase 7B preserves unknown explicit metadata beside normalized labels", async () => {
  const api = await loadViewModels();
  const mcl = json(api.showtime("mcl", {
    id: "mcl:mixed-metadata",
    sourceId: "mixed-metadata",
    cinema: { id: "001" },
    formats: ["2D", "HFR"],
    languages: ["English", "手語"],
    subtitles: ["中文", "法文字幕"]
  }));

  assert.deepEqual(mcl.metadata.formats, ["2D", "HFR"]);
  assert.deepEqual(mcl.metadata.languages, ["英語", "手語"]);
  assert.deepEqual(mcl.metadata.subtitles, ["中文字幕", "法文字幕"]);
});

test("Phase 7B seat-map adapters split status from seat type", async () => {
  const [api, data] = await Promise.all([loadViewModels(), fixtures()]);
  const broadway = json(api.seatMap("broadway", data.broadway.seatMap, data.broadway.showtime));
  const mcl = json(api.seatMap("mcl", data.mcl.seatMap, data.mcl.showtime));
  const emperor = json(api.seatMap("emperor", data.emperor.seatMap, data.emperor.showtime));

  assert.deepEqual(sortedKeys(broadway), sortedKeys(mcl));
  assert.deepEqual(sortedKeys(mcl), sortedKeys(emperor));
  assert.equal(broadway.layoutMode, "grid");
  assert.equal(mcl.layoutMode, "area-grid");
  assert.equal(emperor.layoutMode, "positioned");
  assert.equal(broadway.sessionId, "90001");
  for (const map of [broadway, mcl, emperor]) {
    assert.equal(map.sessionId, map.showtime.sourceId);
  }
  assert.equal(mcl.showtime.cinema.name.display, "MCL THE ONE 戲院");
  assert.equal(mcl.showtime.time, "20:10");
  assert.equal(mcl.bookingUrl, data.mcl.showtime.bookingUrl);
  assert.equal(emperor.showtime.metadata.formats[0], "2D");
  assert.equal(emperor.bookingUrl, data.emperor.showtime.bookingUrl);
  assert.equal(broadway.summary.quality, "exact");
  assert.equal(mcl.summary.quality, "exact");
  assert.equal(emperor.summary.quality, "exact");
  assert.deepEqual(emperor.sections[0].metrics, {
    totalColumns: null,
    cellColumns: null,
    ratioLeft: null,
    ratioTop: null,
    minRow: 1,
    maxRow: 1,
    minColumn: 1,
    maxColumn: 5,
    pitch: 32
  });

  for (const map of [broadway, mcl, emperor]) {
    const states = ["available", "held", "sold", "blocked", "unavailable", "unknown"];
    assert.equal(states.reduce((total, status) => total + map.summary[status], 0), map.summary.total);
  }

  const broadwaySeats = broadway.sections.flatMap(section => section.seats);
  assert.equal(broadwaySeats.find(seat => seat.id === "A2").status, "held");
  assert.equal(broadwaySeats.find(seat => seat.id === "A2").type, "wheelchair");
  assert.equal(broadwaySeats.find(seat => seat.id === "A4").status, "unavailable");
  assert.equal(broadwaySeats.find(seat => seat.id === "A4").type, "special");

  const mclSeats = mcl.sections.flatMap(section => section.seats);
  assert.deepEqual(
    mclSeats.map(seat => [seat.id, seat.status, seat.type]),
    [
      ["A1", "available", "wheelchair"],
      ["A2", "sold", "sofa"],
      ["A3", "blocked", "standard"]
    ]
  );

  const emperorSeats = emperor.sections.flatMap(section => section.seats);
  assert.deepEqual(
    emperorSeats.map(seat => [seat.id, seat.status, seat.type, seat.providerStatus]),
    [
      ["E1", "available", "wheelchair", "available"],
      ["E2", "unavailable", "recliner", "unavailable"],
      ["E3", "blocked", "motion", "disabled"],
      ["E4", "blocked", "couple", "isolation"],
      ["E5", "unavailable", "couple", "unavailable"]
    ]
  );
  assert.deepEqual(emperor.notices, ["座位只供參考", "實際座位以官方頁面為準"]);
});

test("Phase 7B keeps each nested provider notice intact", async () => {
  const [api, data] = await Promise.all([loadViewModels(), fixtures()]);
  const seatMap = {
    ...data.emperor.seatMap,
    notice: "入場後，請調低音量",
    filmLevelNotice: "只適合成年人；請出示證明",
    popupNotices: [["第一項"], ["第二項，保持完整"]]
  };
  const emperor = json(api.seatMap("emperor", seatMap, data.emperor.showtime));

  assert.deepEqual(emperor.notices, [
    "入場後，請調低音量",
    "只適合成年人；請出示證明",
    "第一項",
    "第二項，保持完整"
  ]);
});

test("Phase 7B model loads before the shared detail and seat renderers", async () => {
  const index = await source("app/index.html");
  const registryIndex = index.indexOf("provider-registry.js?v=m7p1c-1");
  const metadataIndex = index.indexOf("showtime-metadata.js?v=7a5");
  const modelIndex = index.indexOf("view-models.js?v=7b3-m7r3-1");

  assert.ok(registryIndex > -1);
  assert.ok(metadataIndex > registryIndex);
  assert.ok(modelIndex > metadataIndex);
  const rendererIndex = index.indexOf("movie-detail-shared.js?v=7b3-m7r3-1");
  assert.ok(rendererIndex > modelIndex);
  for (const script of [
    "app.js?v=7b2",
    "mcl-detail.js?v=7b2",
    "emperor-detail.js?v=7b2",
    "seatmap-shared.js?v=7b3-m7r3-1",
    "seatmap.js?v=7b3",
    "mcl-seatmap.js?v=7b3",
    "emperor-seatmap.js?v=7b3"
  ]) {
    assert.ok(modelIndex < index.indexOf(script), `${script} must load after the shared model`);
  }
});

test("Phase 7B aligns Broadway rows globally and retains MCL legacy rows", async () => {
  const api = await loadViewModels();
  const broadway = json(api.seatMap("broadway", {
    showId: "100",
    rows: [
      { name: "A", seats: [{ id: "A2", label: "2", row: "A", column: 2, status: "available", type: "standard" }] },
      { name: "B", seats: [{ id: "B1", label: "1", row: "B", column: 1, status: "available", type: "standard" }] }
    ]
  }, { sourceId: "100" }));
  assert.equal(broadway.sections[0].rows[0].cells.length, 2);
  assert.equal(broadway.sections[0].rows[0].cells[0].kind, "gap");
  assert.equal(broadway.sections[0].rows[1].cells[0].seat.id, "B1");

  const mcl = json(api.seatMap("mcl", {
    sessionId: "200",
    totalColumns: 3,
    rows: [{
      name: "A",
      seats: [
        { id: "A1", seatNum: "A1", rowName: "A", column: 1, status: "available" },
        { id: "A3", seatNum: "A3", rowName: "A", column: 3, status: "sold" }
      ]
    }]
  }, { sourceId: "200" }));
  assert.equal(mcl.layoutMode, "area-grid");
  assert.equal(mcl.sections.length, 1);
  assert.deepEqual(mcl.sections[0].rows[0].cells.map(cell => cell.kind), ["seat", "gap", "seat"]);
  assert.equal(mcl.summary.total, 2);
});
