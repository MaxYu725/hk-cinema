import assert from "node:assert/strict";

const BASE_URL = String(
  process.env.HK_CINEMA_CANDIDATE_WORKER_URL || "https://hk-cinema-api.max-yu-jp.workers.dev"
).replace(/\/$/, "");

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: "follow",
    cache: "no-store",
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  let payload = null;
  try { payload = await response.json(); }
  catch { throw new Error(`${path} returned non-JSON HTTP ${response.status}`); }
  return { response, payload };
}

const health = await requestJson("/health");
assert.equal(health.response.ok, true);
assert.equal(health.payload?.ok, true);
assert.equal(health.payload?.phase, "6G");
assert.equal(
  health.payload?.providers?.cineart,
  "catalogue-showtimes-detailed-price-strict-seats-seatmap-production-readonly"
);

const discovery = await requestJson("/api/providers/cineart/discovery");
assert.equal(discovery.response.ok, true);
assert.equal(discovery.payload?.ok, true);
const sample = discovery.payload?.data?.home?.sampleShow;
assert.ok(/^\d+$/.test(String(sample?.sourceId || "")), "discovery sample must expose numeric show id");
assert.ok(/^\d+$/.test(String(sample?.movieSourceId || "")), "discovery sample must expose numeric movie id");

const showtimes = await requestJson(`/api/cineart/movies/${encodeURIComponent(sample.movieSourceId)}/shows`);
assert.equal(showtimes.response.ok, true);
assert.equal(showtimes.payload?.ok, true);

const candidates = [sample, ...(showtimes.payload?.data?.sessions || [])];
const seen = new Set();
const rejected = [];
let selected = null;
let path = null;
let first = null;
for (const candidate of candidates.slice(0, 8)) {
  const showId = String(candidate?.sourceId || "");
  const movieId = String(candidate?.movieSourceId || sample.movieSourceId || "");
  if (!/^\d+$/.test(showId) || !/^\d+$/.test(movieId) || seen.has(showId)) continue;
  seen.add(showId);
  const candidatePath = `/api/cineart/shows/${encodeURIComponent(showId)}/seats?movieSourceId=${encodeURIComponent(movieId)}`;
  const attempt = await requestJson(candidatePath);
  if (attempt.response.ok && attempt.payload?.ok === true) {
    selected = candidate;
    path = candidatePath;
    first = attempt;
    break;
  }
  rejected.push({ showId, code: attempt.payload?.error?.code || `HTTP_${attempt.response.status}` });
  assert.equal(
    attempt.payload?.error?.code,
    "CINEART_SEATMAP_GEOMETRY_MISMATCH",
    `unexpected seat-map failure for show ${showId}`
  );
}
assert.ok(first, `no complete live CineArt seat map among bounded candidates: ${JSON.stringify(rejected)}`);
assert.equal(first.payload?.ok, true);
assert.equal(first.payload?.meta?.phase, "M7P1G");
assert.equal(first.payload?.meta?.provider, "cineart");
assert.equal(first.payload?.meta?.mode, "read-only-seatmap-official-geometry");
assert.equal(String(first.payload?.data?.showId), String(selected.sourceId));
assert.equal(String(first.payload?.data?.movieSourceId), String(selected.movieSourceId || sample.movieSourceId));
assert.equal(first.payload?.data?.layoutMode, "positioned");
assert.equal(first.payload?.data?.bookingUrl, null);
assert.equal(first.payload?.data?.source?.geometry, "official-parametric-blocks");
assert.equal(first.payload?.data?.source?.seatStates, "A/H/U/L");
assert.ok(Number(first.payload?.data?.canvas?.width) > 0);
assert.ok(Number(first.payload?.data?.canvas?.height) > 0);
assert.ok(Array.isArray(first.payload?.data?.sections));
assert.equal(first.payload.data.sections.length, 1);

const seats = first.payload.data.sections[0]?.seats || [];
const counts = first.payload.data.counts || {};
assert.ok(seats.length > 0, "live CineArt seat map must expose normalized seats");
assert.equal(counts.total, seats.length);
assert.equal(
  counts.total,
  counts.available + counts.held + counts.sold + counts.blocked + counts.unknown
);
assert.equal(counts.unavailable, counts.held + counts.sold + counts.blocked);
const ids = seats.map(seat => String(seat?.id || ""));
assert.equal(new Set(ids).size, ids.length, "normalized CineArt seat ids must be unique");
assert.equal(ids.every(Boolean), true);

const statuses = new Set(["available", "held", "sold", "blocked", "unknown"]);
for (const seat of seats) {
  assert.equal(statuses.has(seat.status), true, `unexpected seat status ${seat.status}`);
  assert.equal(["standard", "wheelchair"].includes(seat.type), true);
  assert.ok(Number.isFinite(Number(seat?.position?.left)));
  assert.ok(Number.isFinite(Number(seat?.position?.top)));
  assert.ok(Number(seat.position.left) >= 0 && Number(seat.position.left) <= Number(first.payload.data.canvas.width));
  assert.ok(Number(seat.position.top) >= 0 && Number(seat.position.top) <= Number(first.payload.data.canvas.height));
  assert.equal(seat.selectable, seat.status === "available");
}

assert.equal("seatStatus" in first.payload.data, false);
assert.equal("plan" in first.payload.data, false);
assert.equal("seatStates" in first.payload.data, false);
assert.equal("ticketTypes" in first.payload.data, false);

const second = await requestJson(path);
assert.equal(second.response.ok, true);
assert.equal(second.payload?.ok, true);
assert.equal(second.payload?.data?.meta?.cacheState, "fresh-edge");
assert.equal(second.payload.data.sections[0].seats.length, seats.length);

const denied = await requestJson(path, { method: "POST" });
assert.equal(denied.response.status, 405);
assert.equal(denied.payload?.ok, false);
assert.equal(denied.payload?.error?.code, "METHOD_NOT_ALLOWED");

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  health: {
    phase: health.payload.phase,
    cineartService: health.payload.providers.cineart
  },
  sample: {
    showId: selected.sourceId,
    movieId: selected.movieSourceId || sample.movieSourceId,
    cinemaId: selected.cinemaSourceId || selected.cinema?.sourceId || null,
    houseId: selected.houseSourceId || selected.house?.sourceId || null,
    date: selected.date || sample.date,
    time: selected.time || sample.time,
    rejectedCandidates: rejected
  },
  seatMap: {
    cacheState: first.payload.meta.cacheState,
    secondCacheState: second.payload.data.meta.cacheState,
    canvas: first.payload.data.canvas,
    counts,
    rows: Array.from(new Set(seats.map(seat => seat.row).filter(Boolean))).length,
    wheelchair: counts.wheelchair,
    source: first.payload.data.source
  },
  boundaries: {
    rawSeatStatus: false,
    rawPlan: false,
    booking: false,
    readOnly: true
  },
  methodGuard: denied.response.status
}, null, 2));
