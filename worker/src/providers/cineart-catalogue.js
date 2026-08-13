import { getCineArtWorkerSnapshot } from "./cineart.js";

const FRESH_TTL_SECONDS = 60;
const STALE_TTL_SECONDS = 30 * 60;
const CACHE_KEY_BASE = "https://hk-cinema.internal/cache/m7p1c/cineart/catalogue";

function catalogueError(code, message, status = null) {
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

function validCatalogue(value) {
  return Boolean(
    value &&
    Array.isArray(value.now) &&
    Array.isArray(value.coming) &&
    Array.isArray(value.festival)
  );
}

async function readCachedCatalogue(cache, layer) {
  if (!cache?.match) return null;
  const response = await cache.match(cacheKey(layer));
  if (!response) return null;
  try {
    const payload = await response.json();
    return validCatalogue(payload) ? payload : null;
  } catch {
    return null;
  }
}

function cacheResponse(catalogue, ttlSeconds) {
  return new Response(JSON.stringify(catalogue), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttlSeconds}`
    }
  });
}

function withCacheState(catalogue, state, nowMs, upstreamError = null) {
  const updatedAt = catalogue?.meta?.updatedAt || new Date(nowMs).toISOString();
  const parsedUpdatedAt = Date.parse(updatedAt);
  const ageMs = Number.isFinite(parsedUpdatedAt)
    ? Math.max(0, nowMs - parsedUpdatedAt)
    : null;

  return {
    ...catalogue,
    meta: {
      ...(catalogue?.meta || {}),
      provider: "cineart",
      transport: "worker-next-flight",
      cache: state !== "network",
      stale: state === "stale-edge",
      cacheState: state,
      cacheAgeMs: ageMs,
      upstreamError: upstreamError
        ? String(upstreamError?.message || upstreamError)
        : null
    }
  };
}

function productionCatalogue(snapshot, nowMs) {
  const source = snapshot?.normalized?.catalogue || null;
  if (!validCatalogue(source)) {
    throw catalogueError(
      "CINEART_CATALOGUE_INVALID",
      "CineArt Worker snapshot did not contain a valid catalogue"
    );
  }

  const catalogue = {
    now: source.now,
    coming: source.coming,
    festival: source.festival,
    meta: {
      provider: "cineart",
      transport: "worker-next-flight",
      source: snapshot?.transport?.source || "cineart-next-flight-home",
      sourceUrl: snapshot?.normalized?.meta?.sourceUrl || null,
      counts: {
        now: source.now.length,
        coming: source.coming.length,
        festival: source.festival.length,
        sourceMovies: Number(snapshot?.normalized?.meta?.counts?.sourceMovies || 0)
      },
      updatedAt: snapshot?.normalized?.meta?.updatedAt || new Date(nowMs).toISOString()
    }
  };

  if (!catalogue.now.length && !catalogue.coming.length && !catalogue.festival.length) {
    throw catalogueError(
      "CINEART_CATALOGUE_EMPTY",
      "CineArt catalogue contained no current or upcoming movies"
    );
  }

  return catalogue;
}

export function createCineArtCatalogueService({
  fetchImpl = globalThis.fetch,
  cache = globalThis.caches?.default || null,
  now = () => Date.now(),
  timeoutMs,
  maxBytes,
  freshTtlSeconds = FRESH_TTL_SECONDS,
  staleTtlSeconds = STALE_TTL_SECONDS
} = {}) {
  async function store(catalogue, ctx) {
    if (!cache?.put) return;
    const writes = Promise.allSettled([
      cache.put(cacheKey("fresh"), cacheResponse(catalogue, freshTtlSeconds)),
      cache.put(cacheKey("stale"), cacheResponse(catalogue, staleTtlSeconds))
    ]);
    if (ctx?.waitUntil) ctx.waitUntil(writes);
    else await writes;
  }

  async function get({ ctx = null } = {}) {
    const nowMs = now();
    const fresh = await readCachedCatalogue(cache, "fresh");
    if (fresh) return withCacheState(fresh, "fresh-edge", nowMs);

    try {
      const snapshot = await getCineArtWorkerSnapshot({
        fetchImpl,
        timeoutMs,
        maxBytes,
        now: () => nowMs
      });
      const catalogue = productionCatalogue(snapshot, nowMs);
      await store(catalogue, ctx);
      return withCacheState(catalogue, "network", nowMs);
    } catch (error) {
      const stale = await readCachedCatalogue(cache, "stale");
      if (stale) return withCacheState(stale, "stale-edge", nowMs, error);
      throw error;
    }
  }

  return Object.freeze({ get });
}

export const cineArtCatalogueService = createCineArtCatalogueService();

export const CINEART_CATALOGUE_CONFIG = Object.freeze({
  freshTtlSeconds: FRESH_TTL_SECONDS,
  staleTtlSeconds: STALE_TTL_SECONDS
});
