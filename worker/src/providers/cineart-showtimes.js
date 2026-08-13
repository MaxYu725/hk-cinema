import {
  CINEART_HOME_URL,
  getCineArtWorkerSnapshot,
  normalizeCineArtShowDetail
} from "./cineart.js";
import { parseCineArtShowPayload } from "./cineart-flight.js";

const FRESH_TTL_SECONDS = 60;
const STALE_TTL_SECONDS = 10 * 60;
const DETAIL_FRESH_TTL_SECONDS = 20;
const DEFAULT_DETAIL_CONCURRENCY = 3;
const DEFAULT_DETAIL_LIMIT = 6;
const DEFAULT_DETAIL_TIMEOUT_MS = 4500;
const DEFAULT_DETAIL_MAX_BYTES = 2 * 1024 * 1024;
const CACHE_KEY_BASE = "https://hk-cinema.internal/cache/m7p1f/cineart/showtimes";
const DETAIL_CACHE_KEY_BASE = "https://hk-cinema.internal/cache/m7p1f/cineart/show-detail";

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

function detailCacheKey(showSourceId) {
  return new Request(`${DETAIL_CACHE_KEY_BASE}/${encodeURIComponent(showSourceId)}`, {
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

async function readCachedDetail(cache, showSourceId) {
  if (!cache?.match) return null;
  const response = await cache.match(detailCacheKey(showSourceId));
  if (!response) return null;
  try {
    const payload = await response.json();
    return payload && typeof payload === "object" ? payload : null;
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

function positiveInteger(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(maximum, Math.round(number)));
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

function publicDetailedPrice(price) {
  if (!price || typeof price !== "object") return null;
  const ticketTypes = cleanArray(price.ticketTypes).map(ticket => ({
    name: ticket?.name || null,
    price: finiteNumber(ticket?.price),
    concession: ticket?.concession === true
  })).filter(ticket => ticket.name || ticket.price !== null);
  const values = {
    display: finiteNumber(price.display),
    adult: finiteNumber(price.adult),
    student: finiteNumber(price.student),
    child: finiteNumber(price.child),
    senior: finiteNumber(price.senior),
    face: finiteNumber(price.face),
    lowest: finiteNumber(price.lowest)
  };
  if (Object.values(values).every(value => value === null) && !ticketTypes.length) return null;
  return {
    currency: price.currency || "HKD",
    ...values,
    ticketTypes,
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

function publicStrictSeatSummary(summary) {
  if (!summary || typeof summary !== "object") return null;
  const total = finiteNumber(summary.total);
  const available = finiteNumber(summary.available);
  const held = finiteNumber(summary.held);
  const sold = finiteNumber(summary.sold);
  const blocked = finiteNumber(summary.blocked);
  const unavailable = finiteNumber(summary.unavailable);
  const unknown = finiteNumber(summary.unknown);
  if ([total, available, held, sold, blocked, unavailable, unknown].every(value => value === null)) {
    return null;
  }
  return {
    quality: "strict-seat-state",
    total,
    available,
    held,
    sold,
    blocked,
    unavailable,
    unknown,
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

async function readBoundedDetail(response, maxBytes) {
  const text = await response.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) {
    throw serviceError("CINEART_SHOW_DETAIL_TOO_LARGE", `CineArt show detail exceeded ${maxBytes} bytes`, 502);
  }
  return text;
}

function strictProjection(detail) {
  return {
    price: publicDetailedPrice(detail?.price),
    seatSummary: publicStrictSeatSummary(detail?.seatSummary),
    source: detail?.meta?.source || "cineart-next-flight-show",
    updatedAt: detail?.meta?.updatedAt || null
  };
}

export function createCineArtShowtimeService({
  fetchImpl = globalThis.fetch,
  cache = globalThis.caches?.default || null,
  now = () => Date.now(),
  timeoutMs,
  maxBytes,
  freshTtlSeconds = FRESH_TTL_SECONDS,
  staleTtlSeconds = STALE_TTL_SECONDS,
  detailEnrichment = true,
  detailConcurrency = DEFAULT_DETAIL_CONCURRENCY,
  detailLimit = DEFAULT_DETAIL_LIMIT,
  detailTimeoutMs = DEFAULT_DETAIL_TIMEOUT_MS,
  detailMaxBytes = DEFAULT_DETAIL_MAX_BYTES,
  detailFreshTtlSeconds = DETAIL_FRESH_TTL_SECONDS
} = {}) {
  const boundedConcurrency = positiveInteger(detailConcurrency, DEFAULT_DETAIL_CONCURRENCY, 4);
  const boundedDetailLimit = positiveInteger(detailLimit, DEFAULT_DETAIL_LIMIT, 12);
  const boundedDetailTimeout = positiveInteger(detailTimeoutMs, DEFAULT_DETAIL_TIMEOUT_MS, 6000);
  const boundedDetailMaxBytes = positiveInteger(detailMaxBytes, DEFAULT_DETAIL_MAX_BYTES, 4 * 1024 * 1024);

  async function store(snapshot, ctx) {
    if (!cache?.put) return;
    const writes = Promise.allSettled([
      cache.put(cacheKey("fresh"), cacheResponse(snapshot, freshTtlSeconds)),
      cache.put(cacheKey("stale"), cacheResponse(snapshot, staleTtlSeconds))
    ]);
    if (ctx?.waitUntil) ctx.waitUntil(writes);
    else await writes;
  }

  async function storeDetail(showSourceId, detail, ctx) {
    if (!cache?.put || !detail) return;
    const write = cache.put(
      detailCacheKey(showSourceId),
      cacheResponse(detail, detailFreshTtlSeconds)
    );
    if (ctx?.waitUntil) ctx.waitUntil(write);
    else await write;
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

  async function fetchStrictDetail(session, ctx) {
    const cached = await readCachedDetail(cache, session.sourceId);
    if (cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("cineart-show-detail-timeout"), boundedDetailTimeout);
    try {
      const response = await fetchImpl(
        `${CINEART_HOME_URL}/show/${encodeURIComponent(session.sourceId)}`,
        {
          method: "GET",
          redirect: "follow",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
            "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArt/M7P1F)"
          }
        }
      );
      if (!response.ok) {
        throw serviceError(
          "CINEART_SHOW_DETAIL_HTTP_ERROR",
          `CineArt show detail returned HTTP ${response.status}`,
          response.status
        );
      }
      const text = await readBoundedDetail(response, boundedDetailMaxBytes);
      const parsed = parseCineArtShowPayload(text);
      const normalized = normalizeCineArtShowDetail(parsed, { nowMs: now() });
      if (
        normalized.showSourceId !== String(session.sourceId) ||
        normalized.movieSourceId !== String(session.movieSourceId)
      ) {
        throw serviceError("CINEART_SHOW_DETAIL_MISMATCH", "CineArt show detail did not match the requested session", 502);
      }
      const detail = strictProjection(normalized);
      if (!detail.price && !detail.seatSummary) {
        throw serviceError("CINEART_SHOW_DETAIL_EMPTY", "CineArt show detail contained no strict price or seat evidence", 502);
      }
      await storeDetail(session.sourceId, detail, ctx);
      return detail;
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        throw serviceError("CINEART_SHOW_DETAIL_TIMEOUT", "CineArt show detail request timed out", 504);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function enrichSelectedSessions(baseSessions, ctx) {
    if (!detailEnrichment || !baseSessions.length) {
      return {
        sessions: baseSessions,
        stats: { attempted: 0, detailedPrices: 0, strictSeats: 0, fallback: 0, limited: 0 }
      };
    }

    const attempted = baseSessions.slice(0, boundedDetailLimit);
    const remaining = baseSessions.slice(boundedDetailLimit);
    const results = new Array(attempted.length);
    let cursor = 0;

    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= attempted.length) return;
        const session = attempted[index];
        try {
          const detail = await fetchStrictDetail(session, ctx);
          results[index] = {
            ...session,
            price: detail.price || session.price,
            seatSummary: detail.seatSummary || session.seatSummary
          };
        } catch {
          results[index] = session;
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(boundedConcurrency, attempted.length) },
      () => worker()
    );
    await Promise.all(workers);

    const sessions = [...results, ...remaining];
    const detailedPrices = results.filter(session => Array.isArray(session?.price?.ticketTypes)).length;
    const strictSeats = results.filter(session => session?.seatSummary?.quality === "strict-seat-state").length;
    return {
      sessions,
      stats: {
        attempted: attempted.length,
        detailedPrices,
        strictSeats,
        fallback: attempted.length - Math.max(detailedPrices, strictSeats),
        limited: remaining.length
      }
    };
  }

  async function getMovie(movieId, date = null, { ctx = null } = {}) {
    const id = normalizedMovieId(movieId);
    const requestedDate = normalizedDate(date);
    const snapshot = await getSnapshot({ ctx });
    const allSessions = snapshot.sessions.filter(session => session.movieSourceId === id);
    const availableDates = uniqueDates(allSessions);
    const selectedDate = requestedDate || availableDates[0] || null;
    const baseSessions = selectedDate
      ? allSessions.filter(session => session.date === selectedDate)
      : [];
    const enriched = await enrichSelectedSessions(baseSessions, ctx);

    return {
      availableDates,
      selectedDate,
      sessions: enriched.sessions,
      allSessions,
      metadataComplete: true,
      meta: {
        ...(snapshot.meta || {}),
        movieSourceId: id,
        detailMode: detailEnrichment ? "selected-date-bounded" : "coarse-only",
        detail: enriched.stats
      }
    };
  }

  return Object.freeze({ getSnapshot, getMovie });
}

export const cineArtShowtimeService = createCineArtShowtimeService();

export const CINEART_SHOWTIME_CONFIG = Object.freeze({
  freshTtlSeconds: FRESH_TTL_SECONDS,
  staleTtlSeconds: STALE_TTL_SECONDS,
  detailFreshTtlSeconds: DETAIL_FRESH_TTL_SECONDS,
  detailConcurrency: DEFAULT_DETAIL_CONCURRENCY,
  detailLimit: DEFAULT_DETAIL_LIMIT,
  detailTimeoutMs: DEFAULT_DETAIL_TIMEOUT_MS
});
