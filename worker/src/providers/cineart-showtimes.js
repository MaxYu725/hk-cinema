import { getCineArtWorkerSnapshot } from "./cineart.js";

const FRESH_TTL_SECONDS = 60;
const STALE_TTL_SECONDS = 10 * 60;
const CACHE_KEY_BASE = "https://hk-cinema.internal/cache/m7p1e/cineart/showtimes";

function serviceError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  if (Number.isFinite(status)) error.status = status;
  return error;
}

function cacheKey(layer) {
  return new Request(`${CACHE_KEY_BASE}?layer=${encodeURIComponent(layer)}`, {
    method: "GET"
  });
}

function cacheResponse(payload, ttlSeconds) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttlSeconds}`
    }
  });
}

async function readCachedSnapshot(cache, layer) {
  if (!cache?.match) return null;
  const response = await cache.match(cacheKey(layer));
  if (!response) return null;
  try {
    const payload = await response.json();
    return Array.isArray(payload?.sessions) ? payload : null;
  } catch {
    return null;
  }
}

function cleanArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function publicPrice(price) {
  if (!price || typeof price !== "object") return null;
  const display = finiteNumber(price.display);
  const face = finiteNumber(price.face);
  if (display === null && face === null) return null;
  return {
    currency: price.currency || "HKD",
    display: display ?? face,
    face: face ?? display,
    updatedAt: price.updatedAt || null
  };
}

function publicSeatSummary(summary) {
  if (!summary || typeof summary !== "object") return null;
  const total = finiteNumber(summary.total);
  const sold = finiteNumber(summary.sold);
  const notSold = finiteNumber(summary.notSold);
  const upstreamSeatsHold = finiteNumber(summary.upstreamSeatsHold);
  if ([total, sold, notSold, upstreamSeatsHold].every(value => value === null)) return null;

  return {
    quality: "coarse-not-sold",
    total,
    available: null,
    held: null,
    sold,
    blocked: null,
    unavailable: sold,
    notSold,
    upstreamSeatsHold,
    updatedAt: summary.updatedAt || null
  };
}

function publicSession(session) {
  return {
    sourceId: String(session?.sourceId || ""),
    provider: "cineart",
    movieSourceId: String(session?.movieSourceId || ""),
    cinema: session?.cinema || null,
    house: session?.house || null,
    date: session?.date || null,
    time: session?.time || null,
    startAt: session?.startAt || null,
    languages: cleanArray(session?.languages),
    subtitles: cleanArray(session?.subtitles),
    formats: cleanArray(session?.formats),
    // M7P1E publishes only the home Flight base/face price and coarse not-sold summary.
    // Per-show detail remains outside this service; strict A/H/U/L states are not exposed.
    price: publicPrice(session?.price),
    seatSummary: publicSeatSummary(session?.seatSummary),
    bookingUrl: null
  };
}

function productionSnapshot(snapshot, nowMs) {
  const sourceSessions = Array.isArray(snapshot?.normalized?.sessions)
    ? snapshot.normalized.sessions
    : null;
  if (!sourceSessions) {
    throw serviceError(
      "CINEART_SHOWTIMES_INVALID",
      "CineArt Worker snapshot did not contain normalized showtimes"
    );
  }

  const sessions = sourceSessions
    .map(publicSession)
    .filter(session => (
      session.sourceId &&
      session.movieSourceId &&
      session.date &&
      session.time &&
      session.cinema?.sourceId
    ));

  return {
    provider: "cineart",
    sessions,
    meta: {
      provider: "cineart",
      source: snapshot?.transport?.source || "cineart-next-flight-home",
      transport: "worker-next-flight",
      sourceUrl: snapshot?.normalized?.meta?.sourceUrl || null,
      counts: {
        sessions: sessions.length,
        movies: new Set(sessions.map(session => session.movieSourceId)).size,
        sites: Number(snapshot?.normalized?.meta?.counts?.sites || 0),
        houses: Number(snapshot?.normalized?.meta?.counts?.houses || 0)
      },
      updatedAt: snapshot?.normalized?.meta?.updatedAt || new Date(nowMs).toISOString()
    }
  };
}

function withCacheState(snapshot, state, nowMs, upstreamError = null) {
  const updatedAt = snapshot?.meta?.updatedAt || new Date(nowMs).toISOString();
  const parsed = Date.parse(updatedAt);
  return {
    ...snapshot,
    meta: {
      ...(snapshot?.meta || {}),
      provider: "cineart",
      cache: state !== "network",
      stale: state === "stale-edge",
      cacheState: state,
      cacheAgeMs: Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null,
      upstreamError: upstreamError
        ? String(upstreamError?.message || upstreamError)
        : null
    }
  };
}

function normalizedMovieId(value) {
  const id = String(value || "").trim();
  if (!/^\d+$/.test(id)) {
    throw serviceError("CINEART_SHOWTIMES_INVALID_MOVIE", "CineArt movie id must be numeric", 400);
  }
  return id;
}

function normalizedDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw serviceError("CINEART_SHOWTIMES_INVALID_DATE", "CineArt showtime date must be YYYY-MM-DD", 400);
  }
  return date;
}

function uniqueDates(sessions) {
  return Array.from(new Set((sessions || []).map(session => session.date).filter(Boolean))).sort();
}

export function createCineArtShowtimeService({
  fetchImpl = globalThis.fetch,
  cache = globalThis.caches?.default || null,
  now = () => Date.now(),
  timeoutMs,
  maxBytes,
  freshTtlSeconds = FRESH_TTL_SECONDS,
  staleTtlSeconds = STALE_TTL_SECONDS
} = {}) {
  async function store(snapshot, ctx) {
    if (!cache?.put) return;
    const writes = Promise.allSettled([
      cache.put(cacheKey("fresh"), cacheResponse(snapshot, freshTtlSeconds)),
      cache.put(cacheKey("stale"), cacheResponse(snapshot, staleTtlSeconds))
    ]);
    if (ctx?.waitUntil) ctx.waitUntil(writes);
    else await writes;
  }

  async function getSnapshot({ ctx = null } = {}) {
    const nowMs = now();
    const fresh = await readCachedSnapshot(cache, "fresh");
    if (fresh) return withCacheState(fresh, "fresh-edge", nowMs);

    try {
      const source = await getCineArtWorkerSnapshot({
        fetchImpl,
        timeoutMs,
        maxBytes,
        now: () => nowMs
      });
      const snapshot = productionSnapshot(source, nowMs);
      await store(snapshot, ctx);
      return withCacheState(snapshot, "network", nowMs);
    } catch (error) {
      const stale = await readCachedSnapshot(cache, "stale");
      if (stale) return withCacheState(stale, "stale-edge", nowMs, error);
      throw error;
    }
  }

  async function getMovie(movieId, date = null, { ctx = null } = {}) {
    const id = normalizedMovieId(movieId);
    const requestedDate = normalizedDate(date);
    const snapshot = await getSnapshot({ ctx });
    const allSessions = snapshot.sessions.filter(session => session.movieSourceId === id);
    const availableDates = uniqueDates(allSessions);
    const selectedDate = requestedDate || availableDates[0] || null;
    const sessions = selectedDate
      ? allSessions.filter(session => session.date === selectedDate)
      : [];

    return {
      availableDates,
      selectedDate,
      sessions,
      allSessions,
      metadataComplete: true,
      meta: {
        ...(snapshot.meta || {}),
        movieSourceId: id
      }
    };
  }

  return Object.freeze({ getSnapshot, getMovie });
}

export const cineArtShowtimeService = createCineArtShowtimeService();

export const CINEART_SHOWTIME_CONFIG = Object.freeze({
  freshTtlSeconds: FRESH_TTL_SECONDS,
  staleTtlSeconds: STALE_TTL_SECONDS
});
