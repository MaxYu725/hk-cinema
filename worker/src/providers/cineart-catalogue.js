import { parseCineArtHomePayload } from "./cineart-flight.js";
import { CINEART_SOURCE_CONFIG } from "./cineart-source.js";

const MEDIA_BASE = "https://media.grabticks.com/";
const DEFAULT_FRESH_TTL_SECONDS = 60;
const DEFAULT_STALE_TTL_SECONDS = 30 * 60;
const CACHE_KEY_BASE = "https://hk-cinema.internal/cache/m7c/cineart/catalogue";

function catalogueError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  if (Number.isFinite(status)) error.status = status;
  return error;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function hongKongDate(nowMs) {
  return new Date(nowMs + (8 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function localizedObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  const text = value.trim();
  if (!text.startsWith("{")) return { en: text };
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { en: text };
  }
}

function localizedValue(value, language, fallback = null) {
  const object = localizedObject(value);
  if (language === "zh") {
    return object.zh_hk || object.zh_HK || object.zh || fallback;
  }
  return object.en || fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return String(value)
    .split(/[、,，/;；]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function posterUrl(movie) {
  const image = Array.isArray(movie?.images)
    ? movie.images.find(Boolean)
    : null;
  if (!image) return null;
  const text = String(image).trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return new URL(text, MEDIA_BASE).href;
}

function movieTitle(movie) {
  const titleLang = movie?.title_lang || movie?.name_lang;
  return {
    zh: localizedValue(titleLang, "zh", movie?.title || movie?.name || null),
    en: localizedValue(titleLang, "en", movie?.title || movie?.name || null)
  };
}

function movieLanguages(movie) {
  const label = localizedValue(movie?.dialect_lang, "zh", movie?.dialect || null);
  return toArray(label);
}

function movieSubtitles(movie) {
  const label = localizedValue(movie?.subtitle_lang, "zh", movie?.subtitle || null);
  return toArray(label);
}

function movieCategory(movie) {
  const types = Array.isArray(movie?.movieTypes) ? movie.movieTypes : [];
  return types
    .map(type => localizedValue(type?.name_lang, "zh", type?.name || null))
    .filter(Boolean)
    .join("、") || null;
}

function normalizeMovie(movie, status) {
  const sourceId = String(movie?.id ?? "").trim();
  const durationMinutes = numeric(movie?.duration);
  const releaseDate = isoDate(movie?.openingDate);
  const title = movieTitle(movie);

  return {
    id: `cineart:${sourceId}`,
    provider: "cineart",
    sourceId,
    movieKey: null,
    title,
    releaseDate,
    status,
    durationMinutes,
    category: movieCategory(movie),
    rating: movie?.category || null,
    language: movieLanguages(movie),
    subtitles: movieSubtitles(movie),
    director: toArray(localizedValue(movie?.director_lang, "zh", movie?.director || null)),
    cast: toArray(localizedValue(movie?.cast_lang, "zh", movie?.cast || null)),
    poster: posterUrl(movie),
    trailer: movie?.trailer || null,
    formats: [],
    bookingUrl: null
  };
}

export function normalizeCineArtCatalogue(props, { nowMs = Date.now() } = {}) {
  const movies = Array.isArray(props?.movies) ? props.movies : [];
  const shows = Array.isArray(props?.shows) ? props.shows : [];
  const sites = Array.isArray(props?.showSites) ? props.showSites : [];
  const houses = Array.isArray(props?.houseList) ? props.houseList : [];
  const today = hongKongDate(nowMs);

  const liveShowMovieIds = new Set(
    shows
      .filter(show =>
        show?.published !== false &&
        show?.hold !== true &&
        show?.movie?.id != null &&
        (!isoDate(show?.date) || isoDate(show.date) >= today)
      )
      .map(show => String(show.movie.id))
  );

  const now = [];
  const coming = [];

  for (const movie of movies) {
    if (!movie || movie.active === false || movie.id == null) continue;
    const sourceId = String(movie.id);
    const releaseDate = isoDate(movie.openingDate);

    if (releaseDate && releaseDate > today) {
      coming.push(normalizeMovie(movie, "coming-soon"));
      continue;
    }

    if (liveShowMovieIds.has(sourceId)) {
      now.push(normalizeMovie(movie, "now-showing"));
    }
  }

  const byReleaseThenTitle = (left, right) =>
    String(left.releaseDate || "9999-12-31").localeCompare(String(right.releaseDate || "9999-12-31")) ||
    String(left.title?.zh || left.title?.en || "").localeCompare(
      String(right.title?.zh || right.title?.en || ""),
      "zh-HK",
      { numeric: true, sensitivity: "base" }
    );

  now.sort((left, right) =>
    String(right.releaseDate || "0000-00-00").localeCompare(String(left.releaseDate || "0000-00-00")) ||
    byReleaseThenTitle(left, right)
  );
  coming.sort(byReleaseThenTitle);

  return {
    now,
    coming,
    meta: {
      provider: "cineart",
      transport: "worker-next-flight",
      endpoint: CINEART_SOURCE_CONFIG.homeUrl,
      source: "cineart-next-flight-home",
      cache: false,
      stale: false,
      counts: {
        now: now.length,
        coming: coming.length,
        sourceMovies: movies.length,
        sourceShows: shows.length,
        sites: sites.length,
        houses: houses.length
      },
      updatedAt: new Date(nowMs).toISOString()
    }
  };
}

async function readBoundedText(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) {
      throw catalogueError(
        "CINEART_CATALOGUE_PAYLOAD_TOO_LARGE",
        `CineArt catalogue source exceeded ${maxBytes} bytes`
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("cineart-catalogue-payload-too-large").catch(() => {});
        throw catalogueError(
          "CINEART_CATALOGUE_PAYLOAD_TOO_LARGE",
          `CineArt catalogue source exceeded ${maxBytes} bytes`
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

async function fetchHomeProps({ fetchImpl, timeoutMs, maxBytes }) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort("cineart-catalogue-timeout"),
    timeoutMs
  );

  try {
    const response = await fetchImpl(CINEART_SOURCE_CONFIG.homeUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArtCatalogue/M7C)"
      }
    });

    if (!response.ok) {
      throw catalogueError(
        "CINEART_CATALOGUE_HTTP_ERROR",
        `CineArt catalogue returned HTTP ${response.status}`,
        response.status
      );
    }

    return parseCineArtHomePayload(await readBoundedText(response, maxBytes)).props;
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw catalogueError("CINEART_CATALOGUE_TIMEOUT", "CineArt catalogue request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function cacheKey(layer) {
  return new Request(`${CACHE_KEY_BASE}?layer=${encodeURIComponent(layer)}`, { method: "GET" });
}

async function readCachedCatalogue(cache, layer) {
  if (!cache?.match) return null;
  const response = await cache.match(cacheKey(layer));
  if (!response) return null;
  try {
    const payload = await response.json();
    return payload && Array.isArray(payload.now) && Array.isArray(payload.coming)
      ? payload
      : null;
  } catch {
    return null;
  }
}

function cacheResponse(catalogue, ttlSeconds) {
  return new Response(JSON.stringify(catalogue), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `s-maxage=${ttlSeconds}`
    }
  });
}

function withCacheState(catalogue, state, nowMs, upstreamError = null) {
  const updatedAt = catalogue?.meta?.updatedAt || new Date(nowMs).toISOString();
  const ageMs = Math.max(0, nowMs - Date.parse(updatedAt || ""));
  return {
    ...catalogue,
    meta: {
      ...(catalogue?.meta || {}),
      cache: state !== "network",
      stale: state === "stale-edge",
      cacheState: state,
      cacheAgeMs: Number.isFinite(ageMs) ? ageMs : null,
      upstreamError: upstreamError
        ? String(upstreamError?.message || upstreamError)
        : null
    }
  };
}

export function createCineArtCatalogueService({
  fetchImpl = globalThis.fetch,
  cache = globalThis.caches?.default || null,
  now = () => Date.now(),
  timeoutMs = CINEART_SOURCE_CONFIG.timeoutMs,
  maxBytes = CINEART_SOURCE_CONFIG.maxBytes,
  freshTtlSeconds = DEFAULT_FRESH_TTL_SECONDS,
  staleTtlSeconds = DEFAULT_STALE_TTL_SECONDS
} = {}) {
  async function store(catalogue, ctx) {
    if (!cache?.put) return;
    const writes = Promise.allSettled([
      cache.put(cacheKey("fresh"), cacheResponse(catalogue, freshTtlSeconds)),
      cache.put(cacheKey("stale"), cacheResponse(catalogue, staleTtlSeconds))
    ]);
    if (ctx?.waitUntil) {
      ctx.waitUntil(writes);
    } else {
      await writes;
    }
  }

  async function get({ ctx = null } = {}) {
    const nowMs = now();
    const fresh = await readCachedCatalogue(cache, "fresh");
    if (fresh) return withCacheState(fresh, "fresh-edge", nowMs);

    try {
      const props = await fetchHomeProps({ fetchImpl, timeoutMs, maxBytes });
      const catalogue = normalizeCineArtCatalogue(props, { nowMs });
      if (!catalogue.now.length && !catalogue.coming.length) {
        throw catalogueError(
          "CINEART_CATALOGUE_EMPTY",
          "CineArt catalogue contained no current or upcoming movies"
        );
      }
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

export const CINEART_CATALOGUE_CONFIG = Object.freeze({
  homeUrl: CINEART_SOURCE_CONFIG.homeUrl,
  timeoutMs: CINEART_SOURCE_CONFIG.timeoutMs,
  maxBytes: CINEART_SOURCE_CONFIG.maxBytes,
  freshTtlSeconds: DEFAULT_FRESH_TTL_SECONDS,
  staleTtlSeconds: DEFAULT_STALE_TTL_SECONDS,
  mediaBase: MEDIA_BASE
});
