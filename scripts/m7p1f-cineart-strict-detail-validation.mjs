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
  "catalogue-showtimes-detailed-price-strict-seats-production-seatmap-candidate-readonly"
);

const catalogue = await requestJson("/api/cineart/catalogue");
assert.equal(catalogue.response.ok, true);
assert.equal(catalogue.payload?.ok, true);
const candidates = (catalogue.payload?.data?.now || [])
  .filter(item => /^\d+$/.test(String(item?.sourceId || "")))
  .slice(0, 8);
assert.ok(candidates.length > 0, "CineArt catalogue must expose candidate movies");

let selected = null;
for (const movie of candidates) {
  const result = await requestJson(`/api/cineart/movies/${encodeURIComponent(movie.sourceId)}/shows`);
  if (!result.response.ok || result.payload?.ok !== true) continue;
  const sessions = Array.isArray(result.payload?.data?.sessions) ? result.payload.data.sessions : [];
  const strict = sessions.find(session => session?.seatSummary?.quality === "strict-seat-state");
  const detailed = sessions.find(session => Array.isArray(session?.price?.ticketTypes) && session.price.ticketTypes.length > 0);
  if (strict && detailed) {
    selected = { movie, result, strict, detailed };
    break;
  }
}

assert.ok(selected, "at least one current CineArt selected-date result must expose strict seats and detailed price");
const { movie, result: first, strict, detailed } = selected;
assert.equal(first.payload?.meta?.phase, "M7P1F");
assert.equal(first.payload?.meta?.provider, "cineart");
assert.equal(first.payload?.meta?.mode, "showtimes-detailed-price-strict-seats-selected-date");
assert.equal(first.payload?.data?.meta?.detailMode, "selected-date-bounded");
assert.ok(first.payload.data.availableDates.length > 0);
assert.ok(first.payload.data.sessions.length > 0);
assert.ok(first.payload.data.allSessions.length > 0);
assert.ok(first.payload.data.meta.detail.attempted > 0);
assert.ok(first.payload.data.meta.detail.attempted <= 6);
assert.ok(first.payload.data.meta.detail.strictSeats > 0);
assert.ok(first.payload.data.meta.detail.detailedPrices > 0);

for (const session of first.payload.data.allSessions) {
  assert.equal(session?.provider, "cineart");
  assert.equal(String(session?.movieSourceId), String(movie.sourceId));
  assert.equal(session?.bookingUrl, null);
  assert.equal("seatStates" in session, false);
  assert.equal("seatPlan" in session, false);
  if (session?.price) {
    assert.equal("adult" in session.price, false);
    assert.equal("ticketTypes" in session.price, false);
  }
  if (session?.seatSummary) {
    assert.equal(session.seatSummary.quality, "coarse-not-sold");
    assert.equal(session.seatSummary.available, null);
    assert.equal(session.seatSummary.held, null);
  }
}

for (const session of first.payload.data.sessions) {
  assert.equal(session?.bookingUrl, null);
  assert.equal("seatStates" in session, false);
  assert.equal("seatPlan" in session, false);
  if (session?.seatSummary?.quality === "strict-seat-state") {
    const summary = session.seatSummary;
    assert.ok(Number.isFinite(summary.total));
    assert.ok(Number.isFinite(summary.available));
    assert.ok(Number.isFinite(summary.held));
    assert.ok(Number.isFinite(summary.sold));
    assert.ok(Number.isFinite(summary.blocked));
    assert.ok(Number.isFinite(summary.unavailable));
    assert.equal(summary.unavailable, summary.held + summary.sold + summary.blocked);
    if (Number.isFinite(summary.unknown)) {
      assert.equal(
        summary.total,
        summary.available + summary.held + summary.sold + summary.blocked + summary.unknown
      );
    }
  }
  if (Array.isArray(session?.price?.ticketTypes)) {
    assert.equal(session.price.currency, "HKD");
    assert.ok(session.price.ticketTypes.length > 0);
    assert.ok(session.price.ticketTypes.every(ticket => ticket?.name || Number.isFinite(ticket?.price)));
  }
}

assert.ok(Number.isFinite(strict.seatSummary.available));
assert.ok(Array.isArray(detailed.price.ticketTypes));
assert.ok(detailed.price.ticketTypes.length > 0);

const selectedDate = first.payload.data.selectedDate;
const dated = await requestJson(
  `/api/cineart/movies/${encodeURIComponent(movie.sourceId)}/shows?date=${encodeURIComponent(selectedDate)}`
);
assert.equal(dated.response.ok, true);
assert.equal(dated.payload?.ok, true);
assert.equal(dated.payload?.data?.selectedDate, selectedDate);
assert.equal(dated.payload.data.sessions.every(session => session.date === selectedDate), true);
assert.ok(dated.payload.data.meta.detail.attempted <= 6);

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
    phase: first.payload.meta.phase,
    mode: first.payload.meta.mode,
    selectedDate,
    selectedSessions: first.payload.data.sessions.length,
    allSessions: first.payload.data.allSessions.length,
    detail: first.payload.data.meta.detail,
    cacheState: first.payload.meta.cacheState,
    stale: first.payload.meta.stale
  },
  strictSample: {
    sourceId: strict.sourceId,
    time: strict.time,
    cinema: strict.cinema,
    seatSummary: strict.seatSummary
  },
  detailedPriceSample: {
    sourceId: detailed.sourceId,
    time: detailed.time,
    price: detailed.price
  },
  persistentBoundaries: {
    allSessionsCoarse: true,
    seatStates: false,
    seatPlan: false,
    seatMap: false,
    booking: false
  },
  methodGuard: denied.response.status
}, null, 2));
