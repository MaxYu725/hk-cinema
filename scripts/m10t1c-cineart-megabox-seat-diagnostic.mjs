import assert from "node:assert/strict";
import { getCineArtWorkerSnapshot, CINEART_HOME_URL } from "../worker/src/providers/cineart.js";
import {
  parseCineArtShowPayload,
  resolveCineArtFlightTextReference
} from "../worker/src/providers/cineart-flight.js";

const BASE_URL = String(
  process.env.HK_CINEMA_CANDIDATE_WORKER_URL || "https://hk-cinema-api.max-yu-jp.workers.dev"
).replace(/\/$/, "");
const TARGET_DATE = process.env.CINEART_DIAGNOSTIC_DATE || "2026-08-16";
const TARGET_TIME = process.env.CINEART_DIAGNOSTIC_TIME || "14:45";
const TARGET_CINEMA = process.env.CINEART_DIAGNOSTIC_CINEMA || "MegaBox";

function objectShape(value) {
  if (!value || typeof value !== "object") return null;
  return {
    type: Array.isArray(value) ? "array" : "object",
    keys: Object.keys(value).sort(),
    width: Number(value.width) || null,
    height: Number(value.height) || null,
    seatWidth: Number(value.w) || null,
    seatHeight: Number(value.h) || null,
    blockCount: Array.isArray(value.blocks) ? value.blocks.length : null,
    componentCount: Array.isArray(value.comps) ? value.comps.length : null
  };
}

async function workerSeatMap(showId, movieId) {
  const response = await fetch(
    `${BASE_URL}/api/cineart/shows/${encodeURIComponent(showId)}/seats?movieSourceId=${encodeURIComponent(movieId)}`,
    { cache: "no-store", headers: { Accept: "application/json" } }
  );
  let payload = null;
  try { payload = await response.json(); }
  catch { throw new Error(`Candidate seat map returned non-JSON HTTP ${response.status}`); }
  return { response, payload };
}

const snapshot = await getCineArtWorkerSnapshot();
const matches = snapshot.normalized.sessions.filter(session => {
  const cinema = `${session?.cinema?.name?.zh || ""} ${session?.cinema?.name?.en || ""}`;
  return session?.date === TARGET_DATE &&
    session?.time === TARGET_TIME &&
    cinema.toLowerCase().includes(TARGET_CINEMA.toLowerCase());
});

assert.ok(matches.length > 0, `No CineArt ${TARGET_CINEMA} ${TARGET_DATE} ${TARGET_TIME} session found`);
assert.ok(matches.length <= 3, "Diagnostic target unexpectedly matched more than three sessions");

const reports = [];
for (const session of matches) {
  const showId = String(session.sourceId);
  const movieId = String(session.movieSourceId || "");
  const response = await fetch(`${CINEART_HOME_URL}/show/${encodeURIComponent(showId)}`, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArt/M10T1C-Diagnostic)"
    }
  });
  assert.equal(response.ok, true, `CineArt show ${showId} returned HTTP ${response.status}`);
  const text = await response.text();
  assert.ok(text.length > 0 && text.length < 4 * 1024 * 1024, "Show document must stay within diagnostic bounds");

  const parsed = parseCineArtShowPayload(text);
  const show = parsed.props?.showDetail?.show || {};
  const config = show?.plan?.config;
  const resolved = resolveCineArtFlightTextReference(parsed.flight, config);
  const reference = /^\$[0-9a-f]+$/i.test(String(config || "")) ? String(config) : null;
  let recordKind = null;
  if (reference) {
    const id = reference.slice(1).toLowerCase();
    const match = new RegExp(`(?:^|\\n)${id}:([^\\n]{0,16})`, "i").exec(parsed.flight);
    recordKind = match?.[1]?.slice(0, 16) || null;
  }

  let inlineJson = null;
  let inlineJsonError = null;
  if (typeof config === "string" && !reference) {
    try {
      const value = JSON.parse(config);
      inlineJson = objectShape(value) || {
        type: Array.isArray(value) ? "array" : value === null ? "null" : typeof value
      };
    } catch (error) {
      inlineJsonError = error instanceof Error ? error.name : "parse-error";
    }
  }

  assert.ok(resolved && typeof resolved === "object" && !Array.isArray(resolved), "reported MegaBox plan must now resolve as an object");
  assert.equal(Number(resolved.numSeats), Number(session?.seatSummary?.total), "resolved plan seat count must correlate with home session total");

  const live = await workerSeatMap(showId, movieId);
  assert.equal(live.response.ok, true, `candidate Worker seat map returned HTTP ${live.response.status}`);
  assert.equal(live.payload?.ok, true);
  assert.equal(String(live.payload?.data?.showId), showId);
  assert.equal(String(live.payload?.data?.movieSourceId), movieId);
  assert.equal(live.payload?.data?.layoutMode, "positioned");
  assert.equal(Number(live.payload?.data?.counts?.total), Number(session?.seatSummary?.total));
  assert.equal(live.payload?.data?.sections?.[0]?.seats?.length, Number(session?.seatSummary?.total));
  assert.equal(live.payload?.data?.source?.geometry, "official-parametric-blocks");

  reports.push({
    showId,
    movieId,
    cinemaId: session.cinema?.sourceId || null,
    houseId: session.house?.sourceId || null,
    houseName: session.house?.name || null,
    seatSummary: session.seatSummary ? {
      total: session.seatSummary.total,
      sold: session.seatSummary.sold,
      notSold: session.seatSummary.notSold,
      upstreamSeatsHold: session.seatSummary.upstreamSeatsHold
    } : null,
    planConfig: {
      type: Array.isArray(config) ? "array" : config === null ? "null" : typeof config,
      stringLength: typeof config === "string" ? config.length : null,
      startsWithJsonObject: typeof config === "string" ? config.trim().startsWith("{") : false,
      startsWithJsonArray: typeof config === "string" ? config.trim().startsWith("[") : false,
      isFlightTextReference: Boolean(reference),
      reference,
      referenceRecordPrefix: recordKind,
      inlineJson,
      inlineJsonError
    },
    resolvedPlan: objectShape(resolved),
    candidateSeatMap: {
      status: live.response.status,
      total: live.payload.data.counts.total,
      available: live.payload.data.counts.available,
      held: live.payload.data.counts.held,
      sold: live.payload.data.counts.sold,
      blocked: live.payload.data.counts.blocked,
      canvas: live.payload.data.canvas,
      cacheState: live.payload.data.meta?.cacheState || live.payload.meta?.cacheState || null
    }
  });
}

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  target: { date: TARGET_DATE, time: TARGET_TIME, cinema: TARGET_CINEMA },
  matches: reports
}, null, 2));
