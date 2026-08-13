import assert from "node:assert/strict";
import {
  parseCineArtShowPayload,
  resolveCineArtFlightTextReference
} from "../worker/src/providers/cineart-flight.js";

const BASE_URL = String(
  process.env.HK_CINEMA_CANDIDATE_WORKER_URL || "https://hk-cinema-api.max-yu-jp.workers.dev"
).replace(/\/$/, "");
const CINEART_HOME = "https://cinearthouse.com.hk/hk";

function encodedRouterState(movieId) {
  return encodeURIComponent(JSON.stringify([
    "",
    {
      children: [
        ["lng", "hk", "d"],
        {
          children: [
            "movie",
            {
              children: [
                ["movieId", String(movieId), "d"],
                { children: ["__PAGE__", {}, null, null] },
                null,
                null
              ]
            },
            null,
            null
          ]
        },
        null,
        null,
        true
      ]
    },
    null,
    null
  ]));
}

async function requestJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${path} HTTP ${response.status}`);
  assert.equal(payload?.ok, true, `${path} did not return ok:true`);
  return payload;
}

async function fetchShow(showId, movieId) {
  const url = `${CINEART_HOME}/show/${encodeURIComponent(showId)}`;
  const headers = {
    Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArt/M7P1G-Probe)"
  };
  const direct = await fetch(url, { cache: "no-store", redirect: "follow", headers });
  assert.equal(direct.ok, true, `CineArt detail HTTP ${direct.status}`);
  const directText = await direct.text();
  try {
    return { transport: "document", parsed: parseCineArtShowPayload(directText) };
  } catch {
    const rsc = await fetch(`${url}?_rsc=hkcinema-m7p1g-shape`, {
      cache: "no-store",
      redirect: "follow",
      headers: {
        Accept: "*/*",
        RSC: "1",
        "Next-Url": `/hk/movie/${movieId}`,
        "Next-Router-State-Tree": encodedRouterState(movieId),
        "Accept-Language": headers["Accept-Language"],
        "User-Agent": headers["User-Agent"]
      }
    });
    assert.equal(rsc.ok, true, `CineArt detail RSC HTTP ${rsc.status}`);
    return { transport: "rsc", parsed: parseCineArtShowPayload(await rsc.text()) };
  }
}

function seatKeyParts(key) {
  const match = String(key || "").match(/^(.+?)(\d+)$/);
  return match ? { row: match[1], column: Number(match[2]) } : null;
}

function rowAggregate(statuses) {
  const rows = new Map();
  for (const [key, state] of Object.entries(statuses)) {
    const parsed = seatKeyParts(key);
    if (!parsed) continue;
    if (!rows.has(parsed.row)) {
      rows.set(parsed.row, {
        row: parsed.row,
        count: 0,
        minColumn: parsed.column,
        maxColumn: parsed.column,
        states: { A: 0, H: 0, U: 0, L: 0, other: 0 }
      });
    }
    const row = rows.get(parsed.row);
    row.count += 1;
    row.minColumn = Math.min(row.minColumn, parsed.column);
    row.maxColumn = Math.max(row.maxColumn, parsed.column);
    if (Object.hasOwn(row.states, state)) row.states[state] += 1;
    else row.states.other += 1;
  }
  return Array.from(rows.values());
}

function cleanOverride(value) {
  if (value === null || value === undefined) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(cleanOverride);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, cleanOverride(item)]));
  }
  return typeof value;
}

const discovery = await requestJson("/api/providers/cineart/discovery");
const sample = discovery?.data?.home?.sampleShow;
assert.ok(sample?.sourceId, "discovery must expose a sample show id");
assert.ok(sample?.movieSourceId, "discovery must expose a sample movie id");

const detail = await fetchShow(sample.sourceId, sample.movieSourceId);
const props = detail.parsed?.props || {};
const show = props?.showDetail?.show || {};
const statuses = props?.seatStatus?.seats && typeof props.seatStatus.seats === "object"
  ? props.seatStatus.seats
  : {};
const plan = resolveCineArtFlightTextReference(detail.parsed?.flight || "", show?.plan?.config);

assert.ok(plan && typeof plan === "object", "sample show must resolve an official seat plan object");
assert.ok(Object.keys(statuses).length > 0, "sample show must expose seat status keys");

const blocks = Array.isArray(plan.blocks) ? plan.blocks : [];
const blockSummary = blocks.map((block, index) => ({
  index,
  x: block?.x,
  y: block?.y,
  rows: block?.rows,
  cols: block?.cols,
  row: block?.row,
  ccol: block?.ccol,
  col: Array.isArray(block?.col) ? block.col : block?.col,
  rowDir: block?.rowDir,
  colDir: block?.colDir,
  align: block?.align,
  display: block?.display,
  rowDisplay: block?.rowDisplay,
  rpad: block?.rpad,
  removed: Array.isArray(block?.removed) ? block.removed : block?.removed,
  classes: cleanOverride(block?.classes && typeof block.classes === "object" ? block.classes : {}),
  seats: cleanOverride(block?.seats && typeof block.seats === "object" ? block.seats : {})
}));
const rows = rowAggregate(statuses);

assert.equal(
  rows.reduce((sum, row) => sum + row.count, 0),
  Object.keys(statuses).length,
  "row aggregate must cover every seat-status key"
);

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  sample: {
    showId: sample.sourceId,
    movieId: sample.movieSourceId,
    cinemaId: sample.cinemaSourceId,
    houseId: sample.houseSourceId,
    date: sample.date,
    time: sample.time,
    transport: detail.transport
  },
  plan: {
    width: plan.width,
    height: plan.height,
    iwidth: plan.iwidth,
    iheight: plan.iheight,
    w: plan.w,
    h: plan.h,
    gx: plan.gx,
    gy: plan.gy,
    numSeats: plan.numSeats,
    blockCount: blocks.length,
    blocks: blockSummary,
    components: Array.isArray(plan.comps) ? plan.comps.map(comp => ({
      id: comp?.id,
      x: comp?.x,
      y: comp?.y,
      w: comp?.w,
      h: comp?.h
    })) : []
  },
  seatStatus: {
    count: Object.keys(statuses).length,
    rows,
    firstKeys: Object.keys(statuses).slice(0, 30),
    lastKeys: Object.keys(statuses).slice(-30)
  }
}, null, 2));
