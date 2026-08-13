import assert from "node:assert/strict";

const BASE_URL = String(
  process.env.HK_CINEMA_CANDIDATE_WORKER_URL || "https://hk-cinema-api.max-yu-jp.workers.dev"
).replace(/\/$/, "");

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: "follow",
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

const health = await jsonRequest("/health");
assert.equal(health.response.ok, true);
assert.equal(health.payload?.ok, true);
assert.equal(health.payload?.data?.phase, "6G");
assert.equal(
  health.payload?.data?.providers?.cineart,
  "catalogue-production-shows-candidate-readonly"
);

const catalogue = await jsonRequest("/api/cineart/catalogue");
assert.equal(catalogue.response.ok, true);
assert.equal(catalogue.payload?.ok, true);
assert.equal(catalogue.payload?.meta?.phase, "M7P1C");
assert.equal(catalogue.payload?.meta?.provider, "cineart");
assert.equal(catalogue.payload?.meta?.mode, "catalogue-only");
assert.ok(Array.isArray(catalogue.payload?.data?.now));
assert.ok(Array.isArray(catalogue.payload?.data?.coming));
assert.ok(Array.isArray(catalogue.payload?.data?.festival));
assert.ok(
  catalogue.payload.data.now.length +
  catalogue.payload.data.coming.length +
  catalogue.payload.data.festival.length > 0,
  "live CineArt catalogue must contain at least one movie"
);
assert.equal("sessions" in catalogue.payload.data, false);
assert.equal("cinemas" in catalogue.payload.data, false);
assert.equal("seatSummary" in catalogue.payload.data, false);
for (const movie of [...catalogue.payload.data.now, ...catalogue.payload.data.coming]) {
  assert.equal(movie?.provider, "cineart");
  assert.ok(String(movie?.sourceId || "").length > 0);
  assert.ok(movie?.title?.zh || movie?.title?.en);
  assert.equal(movie?.bookingUrl ?? null, null);
}

const denied = await jsonRequest("/api/cineart/catalogue", { method: "POST" });
assert.equal(denied.response.status, 405);
assert.equal(denied.payload?.ok, false);
assert.equal(denied.payload?.error?.code, "METHOD_NOT_ALLOWED");

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  health: {
    phase: health.payload.data.phase,
    cineartService: health.payload.data.providers.cineart
  },
  catalogue: {
    now: catalogue.payload.data.now.length,
    coming: catalogue.payload.data.coming.length,
    festival: catalogue.payload.data.festival.length,
    cacheState: catalogue.payload.meta.cacheState,
    stale: catalogue.payload.meta.stale,
    updatedAt: catalogue.payload.meta.updatedAt
  },
  methodGuard: denied.response.status
}, null, 2));
