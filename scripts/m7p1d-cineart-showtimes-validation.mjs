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
assert.ok(String(health.payload?.providers?.cineart || "").includes("showtimes"));

const catalogue = await requestJson("/api/cineart/catalogue");
assert.equal(catalogue.response.ok, true);
assert.equal(catalogue.payload?.ok, true);
const movie = catalogue.payload?.data?.now?.find(item => /^\d+$/.test(String(item?.sourceId || "")));
assert.ok(movie, "live CineArt now-showing catalogue must expose a numeric movie source id");

const first = await requestJson(`/api/cineart/movies/${encodeURIComponent(movie.sourceId)}/shows`);
assert.equal(first.response.ok, true);
assert.equal(first.payload?.ok, true);
assert.equal(first.payload?.meta?.provider, "cineart");
assert.match(String(first.payload?.meta?.phase || ""), /^M7P1[D-Z0-9-]*$/i);
assert.ok(Array.isArray(first.payload?.data?.availableDates));
assert.ok(Array.isArray(first.payload?.data?.sessions));
assert.ok(Array.isArray(first.payload?.data?.allSessions));
assert.ok(first.payload.data.availableDates.length > 0, "CineArt movie must expose at least one available date");
assert.ok(first.payload.data.allSessions.length > 0, "CineArt movie must expose at least one showtime");
assert.ok(first.payload.data.availableDates.includes(first.payload.data.selectedDate));
assert.ok(first.payload.data.sessions.length > 0);

for (const session of first.payload.data.allSessions) {
  assert.equal(session?.provider, "cineart");
  assert.equal(String(session?.movieSourceId), String(movie.sourceId));
  assert.ok(/^\d+$/.test(String(session?.sourceId || "")));
  assert.match(String(session?.date || ""), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(String(session?.time || ""), /^\d{2}:\d{2}$/);
  assert.ok(String(session?.cinema?.sourceId || "").length > 0);
  assert.ok(session?.cinema?.name?.zh || session?.cinema?.name?.en);
  assert.equal(
    session?.bookingUrl,
    `https://cinearthouse.com.hk/hk/show/${encodeURIComponent(session.sourceId)}`
  );
  assert.equal("seatStates" in session, false);
  assert.equal("seatPlan" in session, false);
  assert.equal("ticketTypes" in session, false);
}

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
assert.equal(denied.payload?.ok, false);
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
    availableDates: first.payload.data.availableDates.length,
    allSessions: first.payload.data.allSessions.length,
    selectedDate,
    selectedSessions: dated.payload.data.sessions.length,
    cacheState: first.payload.meta.cacheState,
    stale: first.payload.meta.stale
  },
  persistentBoundaries: {
    exactSessionBooking: true,
    perShowSeatStates: false,
    seatPlan: false
  },
  methodGuard: denied.response.status
}, null, 2));
