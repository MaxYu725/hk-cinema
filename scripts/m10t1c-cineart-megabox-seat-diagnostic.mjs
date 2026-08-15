import assert from "node:assert/strict";
import { getCineArtWorkerSnapshot, CINEART_HOME_URL } from "../worker/src/providers/cineart.js";
import {
  parseCineArtShowPayload,
  resolveCineArtFlightTextReference
} from "../worker/src/providers/cineart-flight.js";

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

  reports.push({
    showId,
    movieId: String(session.movieSourceId || ""),
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
    resolvedPlan: objectShape(resolved) || {
      type: resolved === null ? "null" : typeof resolved
    }
  });
}

console.log(JSON.stringify({
  ok: true,
  target: { date: TARGET_DATE, time: TARGET_TIME, cinema: TARGET_CINEMA },
  matches: reports
}, null, 2));
