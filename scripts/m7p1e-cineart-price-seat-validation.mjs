import assert from "node:assert/strict";

const BASE_URL = String(
  process.env.HK_CINEMA_CANDIDATE_WORKER_URL || "https://hk-cinema-api.max-yu-jp.workers.dev"
).replace(/\/$/, "");

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: "follow",
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${path} returned non-JSON HTTP ${response.status}`);
  }
  return { response, payload };
}

const health = await requestJson("/health");
assert.equal(health.response.ok, true);
assert.equal(health.payload?.ok, true);
assert.equal(health.payload?.phase, "6G");
assert.equal(
  health.payload?.providers?.cineart,
  "catalogue-showtimes-price-coarse-seats-production-detail-candidate-readonly"
);

const catalogue = await requestJson("/api/cineart/catalogue");
assert.equal(catalogue.response.ok, true);
assert.equal(catalogue.payload?.ok, true);
const candidates = (catalogue.payload?.data?.now || [])
  .filter(item => /^\d+$/.test(String(item?.sourceId || "")))
  .slice(0, 6);
assert.ok(candidates.length > 0, "CineArt catalogue must expose candidate movies");

let selected = null;
for (const movie of candidates) {
  const result = await requestJson(`/api/cineart/movies/${encodeURIComponent(movie.sourceId)}/shows`);
  if (!result.response.ok || result.payload?.ok !== true) continue;
  const sessions = Array.isArray(result.payload?.data?.allSessions)
    ? result.payload.data.allSessions
    : [];
  const usable = sessions.find(session => session?.price && session?.seatSummary);
  if (usable) {
    selected = { movie, result, usable };
    break;
  }
}

assert.ok(selected, "at least one current CineArt movie must expose base price and coarse seat summary");
const { movie, result: first, usable: sample } = selected;
assert.equal(first.payload?.meta?.phase, "M7P1E");
assert.equal(first.payload?.meta?.provider, "cineart");
assert.equal(first.payload?.meta?.mode, "showtimes-base-price-coarse-seats");
assert.ok(first.payload.data.availableDates.length > 0);
assert.ok(first.payload.data.allSessions.length > 0);

let priceCount = 0;
let seatCount = 0;
for (const session of first.payload.data.allSessions) {
  assert.equal(session?.provider, "cineart");
  assert.equal(String(session?.movieSourceId), String(movie.sourceId));
  assert.equal(session?.bookingUrl, null);
  assert.equal("seatStates" in session, false);
  assert.equal("seatPlan" in session, false);
  assert.equal("ticketTypes" in session, false);

  if (session?.price) {
    priceCount += 1;
    assert.equal(session.price.currency, "HKD");
    assert.ok(Number.isFinite(session.price.display));
    assert.ok(Number.isFinite(session.price.face));
    assert.equal("adult" in session.price, false);
    assert.equal("student" in session.price, false);
    assert.equal("child" in session.price, false);
    assert.equal("senior" in session.price, false);
  }

  if (session?.seatSummary) {
    seatCount += 1;
    const summary = session.seatSummary;
    assert.equal(summary.quality, "coarse-not-sold");
    assert.equal(summary.available, null);
    assert.equal(summary.held, null);
    assert.equal(summary.blocked, null);
    assert.ok(Number.isFinite(summary.total));
    assert.ok(Number.isFinite(summary.sold));
    assert.ok(Number.isFinite(summary.notSold));
    assert.equal(summary.unavailable, summary.sold);
    assert.equal(summary.total, summary.sold + summary.notSold);
    if (summary.upstreamSeatsHold !== null) {
      assert.ok(Number.isFinite(summary.upstreamSeatsHold));
    }
  }
}

assert.ok(priceCount > 0, "current CineArt showtimes must expose base/face price evidence");
assert.ok(seatCount > 0, "current CineArt showtimes must expose coarse not-sold evidence");

const selectedDate = first.payload.data.availableDates[0];
const dated = await requestJson(
  `/api/cineart/movies/${encodeURIComponent(movie.sourceId)}/shows?date=${encodeURIComponent(selectedDate)}`
);
assert.equal(dated.response.ok, true);
assert.equal(dated.payload?.ok, true);
assert.equal(dated.payload?.data?.selectedDate, selectedDate);
assert.ok(dated.payload.data.sessions.length > 0);
assert.equal(dated.payload.data.sessions.every(session => session.date === selectedDate), true);

const denied = await requestJson(
  `/api/cineart/movies/${encodeURIComponent(movie.sourceId)}/shows`,
  { method: "POST" }
);
assert.equal(denied.response.status, 405);
assert.equal(denied.payload?.error?.code, "METHOD_NOT_ALLOWED");

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  health: {
    phase: health.payload.phase,
    cineartService: health.payload.providers.cineart
  },
  movie: {
    sourceId: movie.sourceId,
    title: movie.title
  },
  showtimes: {
    availableDates: first.payload.data.availableDates.length,
    allSessions: first.payload.data.allSessions.length,
    selectedDate,
    selectedSessions: dated.payload.data.sessions.length,
    priceCount,
    coarseSeatCount: seatCount,
    cacheState: first.payload.meta.cacheState,
    stale: first.payload.meta.stale
  },
  sample: {
    sourceId: sample.sourceId,
    time: sample.time,
    cinema: sample.cinema,
    price: sample.price,
    coarseSeatSummary: sample.seatSummary
  },
  stagedCapabilities: {
    prices: true,
    coarseSeatSummary: true,
    strictSeatSummary: false,
    seatMap: false,
    booking: false
  },
  methodGuard: denied.response.status
}, null, 2));
