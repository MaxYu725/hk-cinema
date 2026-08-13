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
const cineartService = String(health.payload?.providers?.cineart || "");
assert.match(cineartService, /detailed-price/);
assert.match(cineartService, /strict-seats/);
assert.match(cineartService, /production/);
assert.match(cineartService, /readonly/);

const discovery = await requestJson("/api/providers/cineart/discovery");
assert.equal(discovery.response.ok, true);
assert.equal(discovery.payload?.ok, true);
const sample = discovery.payload?.data?.home?.sampleShow;
assert.ok(sample, "CineArt discovery must expose a current sample show");
assert.ok(/^\d+$/.test(String(sample.movieSourceId || "")));
assert.match(String(sample.date || ""), /^\d{4}-\d{2}-\d{2}$/);

const first = await requestJson(
  `/api/cineart/movies/${encodeURIComponent(sample.movieSourceId)}/shows?date=${encodeURIComponent(sample.date)}`
);
assert.equal(first.response.ok, true);
assert.equal(first.payload?.ok, true);
assert.equal(first.payload?.meta?.phase, "M7P1F");
assert.equal(first.payload?.meta?.provider, "cineart");
assert.equal(first.payload?.meta?.mode, "showtimes-detailed-price-strict-seats-selected-date");
assert.equal(first.payload?.data?.meta?.detailMode, "selected-date-bounded");
assert.equal(first.payload?.data?.selectedDate, sample.date);
assert.ok(first.payload.data.availableDates.length > 0);
assert.ok(first.payload.data.sessions.length > 0);
assert.ok(first.payload.data.allSessions.length > 0);
assert.ok(first.payload.data.meta.detail.attempted > 0);
assert.ok(first.payload.data.meta.detail.attempted <= 6);
assert.ok(first.payload.data.meta.detail.strictSeats > 0);
assert.ok(first.payload.data.meta.detail.detailedPrices > 0);

const strict = first.payload.data.sessions.find(session => session?.seatSummary?.quality === "strict-seat-state");
const detailed = first.payload.data.sessions.find(session => Array.isArray(session?.price?.ticketTypes) && session.price.ticketTypes.length > 0);
assert.ok(strict, "discovery sample date must expose at least one strict CineArt seat summary");
assert.ok(detailed, "discovery sample date must expose at least one detailed CineArt price");

for (const session of first.payload.data.allSessions) {
  assert.equal(session?.provider, "cineart");
  assert.equal(String(session?.movieSourceId), String(sample.movieSourceId));
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
      assert.equal(summary.total, summary.available + summary.held + summary.sold + summary.blocked + summary.unknown);
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

const denied = await requestJson(`/api/cineart/movies/${encodeURIComponent(sample.movieSourceId)}/shows`, { method: "POST" });
assert.equal(denied.response.status, 405);
assert.equal(denied.payload?.error?.code, "METHOD_NOT_ALLOWED");

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  health: { phase: health.payload.phase, cineartService },
  discoverySample: { sourceId: sample.sourceId, movieSourceId: sample.movieSourceId, date: sample.date, time: sample.time },
  showtimes: {
    phase: first.payload.meta.phase,
    mode: first.payload.meta.mode,
    selectedDate: first.payload.data.selectedDate,
    selectedSessions: first.payload.data.sessions.length,
    allSessions: first.payload.data.allSessions.length,
    detail: first.payload.data.meta.detail,
    cacheState: first.payload.meta.cacheState,
    stale: first.payload.meta.stale
  },
  strictSample: { sourceId: strict.sourceId, time: strict.time, cinema: strict.cinema, seatSummary: strict.seatSummary },
  detailedPriceSample: { sourceId: detailed.sourceId, time: detailed.time, price: detailed.price },
  persistentShowtimeBoundaries: { allSessionsCoarse: true, seatStates: false, seatPlan: false, booking: false },
  methodGuard: denied.response.status
}, null, 2));
