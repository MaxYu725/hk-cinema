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

function brief(value, depth = 4) {
  if (depth <= 0) return Array.isArray(value) ? `[array:${value.length}]` : typeof value;
  if (value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value === "string" && value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 3).map(item => brief(item, depth - 1))
    };
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return {
      type: "object",
      keys: keys.slice(0, 40),
      sample: Object.fromEntries(keys.slice(0, 16).map(key => [key, brief(value[key], depth - 1)]))
    };
  }
  return typeof value;
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
    const rscUrl = `${url}?_rsc=hkcinema-m7p1g-shape`;
    const rsc = await fetch(rscUrl, {
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
  showShape: brief(show, 2),
  planShape: brief(plan, 5),
  seatStatus: {
    count: Object.keys(statuses).length,
    sample: Object.fromEntries(Object.entries(statuses).slice(0, 16))
  }
}, null, 2));
