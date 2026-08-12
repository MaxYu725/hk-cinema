import {
  parseCineArtHomePayload,
  parseCineArtShowPayload
} from "./cineart-flight.js";
import { CINEART_SOURCE_CONFIG } from "./cineart-source.js";

const SHOWTIME_CACHE_KEY = "https://hk-cinema.internal/cache/m7d/cineart/showtimes";
const DETAIL_CACHE_KEY = "https://hk-cinema.internal/cache/m7d/cineart/show-detail";
const DEFAULT_SHOWTIME_TTL_SECONDS = 60;
const DEFAULT_SHOWTIME_STALE_SECONDS = 10 * 60;
const DEFAULT_DETAIL_TTL_SECONDS = 20;

function serviceError(code, message, status = null) {
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
  return new Date(nowMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function hongKongTime(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(timestamp));
}

function localizedObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  const text = value.trim();
  if (!text) return {};
  if (!text.startsWith("{")) return { en: text };
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { en: text };
  }
}

function localized(value, fallback = null) {
  const object = localizedObject(value);
  return {
    zh: object.zh_hk || object.zh_HK || object.zh || fallback,
    en: object.en || fallback
  };
}

function splitValues(value) {
  if (value === null || value === undefined || value === "") return [];
  return (Array.isArray(value) ? value : [value])
    .flatMap(item => String(item || "").split(/[、,，/;；]+/))
    .map(item => item.trim())
    .filter(Boolean);
}

async function readBoundedText(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) {
      throw serviceError(
        "CINEART_SHOWTIME_PAYLOAD_TOO_LARGE",
        `CineArt source exceeded ${maxBytes} bytes`
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("cineart-showtime-payload-too-large").catch(() => {});
        throw serviceError(
          "CINEART_SHOWTIME_PAYLOAD_TOO_LARGE",
          `CineArt source exceeded ${maxBytes} bytes`
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

async function fetchBounded({ fetchImpl, url, timeoutMs, maxBytes, headers = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("cineart-showtime-timeout"), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArtShowtimes/M7D)",
        ...headers
      }
    });
    if (!response.ok) {
      throw serviceError(
        "CINEART_SHOWTIME_HTTP_ERROR",
        `CineArt source returned HTTP ${response.status}`,
        response.status
      );
    }
    return await readBoundedText(response, maxBytes);
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw serviceError("CINEART_SHOWTIME_TIMEOUT", "CineArt showtime request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function siteName(site) {
  const name = localized(site?.name_lang, site?.name || null);
  return {
    zh: name.zh || site?.name || "影藝戲院",
    en: name.en || site?.name || "CineArt"
  };
}

function movieMetadata(movie) {
  const language = localized(movie?.dialect_lang, movie?.dialect || null).zh;
  const subtitles = localized(movie?.subtitle_lang, movie?.subtitle || null).zh;
  return {
    languages: splitValues(language),
    subtitles: splitValues(subtitles)
  };
}

export function normalizeCineArtShowtimeSnapshot(props, { nowMs = Date.now() } = {}) {
  const shows = Array.isArray(props?.shows) ? props.shows : [];
  const sites = Array.isArray(props?.showSites) ? props.showSites : [];
  const houses = Array.isArray(props?.houseList) ? props.houseList : [];
  const movies = Array.isArray(props?.movies) ? props.movies : [];
  const today = hongKongDate(nowMs);

  const siteMap = new Map(sites.map(site => [String(site?.id ?? ""), site]));
  const houseMap = new Map(houses.map(house => [String(house?.id ?? ""), house]));
  const movieMap = new Map(movies.map(movie => [String(movie?.id ?? ""), movie]));

  const sessions = shows
    .filter(show => {
      const date = isoDate(show?.date);
      return Boolean(
        show?.id != null &&
        show?.movie?.id != null &&
        show?.site?.id != null &&
        show?.published !== false &&
        show?.hold !== true &&
        date && date >= today
      );
    })
    .map(show => {
      const sourceId = String(show.id);
      const movieSourceId = String(show.movie.id);
      const site = siteMap.get(String(show.site.id)) || show.site || {};
      const house = houseMap.get(String(show?.house?.id ?? "")) || show.house || {};
      const movie = movieMap.get(movieSourceId) || show.movie || {};
      const total = numeric(show.seats);
      const sold = numeric(show.sold);
      const coarseRemaining = numeric(show.avaliable);
      const displayPrice = numeric(show.price);
      const metadata = movieMetadata(movie);

      return {
        sourceId,
        provider: "cineart",
        movieSourceId,
        cinema: {
          sourceId: String(site?.id ?? show.site.id),
          code: site?.code || null,
          name: siteName(site)
        },
        house: {
          sourceId: show?.house?.id != null ? String(show.house.id) : null,
          name: house?.name || show?.house?.name || null
        },
        date: isoDate(show.date),
        time: hongKongTime(show.time) || "--:--",
        startAt: show.time || null,
        languages: metadata.languages,
        subtitles: metadata.subtitles,
        formats: [],
        price: Number.isFinite(displayPrice)
          ? {
              currency: "HKD",
              display: displayPrice,
              face: displayPrice,
              updatedAt: new Date(nowMs).toISOString()
            }
          : null,
        seatSummary: Number.isFinite(total) || Number.isFinite(sold) || Number.isFinite(coarseRemaining)
          ? {
              quality: "coarse-not-sold",
              total,
              available: null,
              held: null,
              sold,
              blocked: null,
              unavailable: sold,
              unknown: coarseRemaining,
              coarseRemaining,
              updatedAt: new Date(nowMs).toISOString()
            }
          : null,
        bookingUrl: null
      };
    })
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.time.localeCompare(right.time) ||
      left.cinema.sourceId.localeCompare(right.cinema.sourceId)
    );

  return {
    provider: "cineart",
    sessions,
    meta: {
      provider: "cineart",
      source: "cineart-next-flight-home",
      transport: "worker-next-flight",
      sourceUrl: CINEART_SOURCE_CONFIG.homeUrl,
      cache: false,
      stale: false,
      counts: {
        sessions: sessions.length,
        movies: new Set(sessions.map(session => session.movieSourceId)).size,
        sites: sites.length,
        houses: houses.length
      },
      updatedAt: new Date(nowMs).toISOString()
    }
  };
}

export function selectCineArtMovieShows(snapshot, movieId, date = null) {
  const normalizedMovieId = String(movieId || "").trim();
  const allSessions = (snapshot?.sessions || []).filter(
    session => session.movieSourceId === normalizedMovieId
  );
  const availableDates = Array.from(new Set(allSessions.map(session => session.date))).sort();
  const selectedDate = date && availableDates.includes(date)
    ? date
    : availableDates[0] || date || null;
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
      ...(snapshot?.meta || {}),
      movieSourceId: normalizedMovieId
    }
  };
}

function cacheRequest(base, layer, suffix = "") {
  return new Request(`${base}${suffix}?layer=${encodeURIComponent(layer)}`, { method: "GET" });
}

function cacheResponse(payload, ttlSeconds) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `s-maxage=${ttlSeconds}`
    }
  });
}

async function readCache(cache, request) {
  if (!cache?.match) return null;
  const response = await cache.match(request);
  if (!response) return null;
  try { return await response.json(); }
  catch { return null; }
}

function withCacheState(payload, state, upstreamError = null) {
  return {
    ...payload,
    meta: {
      ...(payload?.meta || {}),
      cache: state !== "network",
      stale: state === "stale-edge",
      cacheState: state,
      upstreamError: upstreamError ? String(upstreamError?.message || upstreamError) : null
    }
  };
}

export function createCineArtShowtimeService({
  fetchImpl = globalThis.fetch,
  cache = globalThis.caches?.default || null,
  now = () => Date.now(),
  timeoutMs = CINEART_SOURCE_CONFIG.timeoutMs,
  maxBytes = CINEART_SOURCE_CONFIG.maxBytes,
  freshTtlSeconds = DEFAULT_SHOWTIME_TTL_SECONDS,
  staleTtlSeconds = DEFAULT_SHOWTIME_STALE_SECONDS
} = {}) {
  async function store(snapshot, ctx) {
    if (!cache?.put) return;
    const writes = Promise.allSettled([
      cache.put(cacheRequest(SHOWTIME_CACHE_KEY, "fresh"), cacheResponse(snapshot, freshTtlSeconds)),
      cache.put(cacheRequest(SHOWTIME_CACHE_KEY, "stale"), cacheResponse(snapshot, staleTtlSeconds))
    ]);
    if (ctx?.waitUntil) ctx.waitUntil(writes);
    else await writes;
  }

  async function snapshot({ ctx = null } = {}) {
    const fresh = await readCache(cache, cacheRequest(SHOWTIME_CACHE_KEY, "fresh"));
    if (fresh?.sessions) return withCacheState(fresh, "fresh-edge");

    try {
      const text = await fetchBounded({
        fetchImpl,
        url: CINEART_SOURCE_CONFIG.homeUrl,
        timeoutMs,
        maxBytes
      });
      const props = parseCineArtHomePayload(text).props;
      const normalized = normalizeCineArtShowtimeSnapshot(props, { nowMs: now() });
      if (!normalized.sessions.length) {
        throw serviceError("CINEART_SHOWTIME_EMPTY", "CineArt source contained no current showtimes");
      }
      await store(normalized, ctx);
      return withCacheState(normalized, "network");
    } catch (error) {
      const stale = await readCache(cache, cacheRequest(SHOWTIME_CACHE_KEY, "stale"));
      if (stale?.sessions) return withCacheState(stale, "stale-edge", error);
      throw error;
    }
  }

  async function getMovie(movieId, date = null, { ctx = null } = {}) {
    const current = await snapshot({ ctx });
    const selected = selectCineArtMovieShows(current, movieId, date);
    selected.meta = {
      ...selected.meta,
      cacheState: current.meta?.cacheState || "network",
      cache: current.meta?.cache === true,
      stale: current.meta?.stale === true,
      updatedAt: current.meta?.updatedAt || new Date(now()).toISOString()
    };
    return selected;
  }

  return Object.freeze({ snapshot, getMovie });
}

function encodedRouterState(movieId) {
  return encodeURIComponent(JSON.stringify([
    "",
    {
      children: [
        ["lng", "hk", "d"],
        {
          children: [
            "movie",
            {
              children: [
                ["movieId", String(movieId), "d"],
                { children: ["__PAGE__", {}, null, null] },
                null,
                null
              ]
            },
            null,
            null
          ]
        },
        null,
        null,
        true
      ]
    },
    null,
    null
  ]));
}

async function fetchDetailParsed({ fetchImpl, showId, movieId, timeoutMs, maxBytes }) {
  const showUrl = `${CINEART_SOURCE_CONFIG.homeUrl}/show/${encodeURIComponent(showId)}`;
  const direct = await fetchBounded({ fetchImpl, url: showUrl, timeoutMs, maxBytes });
  try {
    return parseCineArtShowPayload(direct);
  } catch {
    const rsc = await fetchBounded({
      fetchImpl,
      url: `${showUrl}?_rsc=hkcinema-m7d`,
      timeoutMs,
      maxBytes,
      headers: {
        Accept: "*/*",
        RSC: "1",
        "Next-Url": `/hk/movie/${movieId}`,
        "Next-Router-State-Tree": encodedRouterState(movieId)
      }
    });
    return parseCineArtShowPayload(rsc);
  }
}

function ticketPrice(ticketTypes, words) {
  const match = ticketTypes.find(ticket => {
    const name = String(ticket?.name || "").toLowerCase();
    return words.some(word => name.includes(word));
  });
  return numeric(match?.price);
}

export function normalizeCineArtShowDetail(parsed, { nowMs = Date.now() } = {}) {
  const props = parsed?.props || {};
  const show = props?.showDetail?.show || {};
  const statuses = props?.seatStatus?.seats && typeof props.seatStatus.seats === "object"
    ? props.seatStatus.seats
    : {};
  const counts = { A: 0, H: 0, U: 0, L: 0, unknown: 0 };
  for (const value of Object.values(statuses)) {
    const state = String(value || "unknown");
    if (Object.hasOwn(counts, state)) counts[state] += 1;
    else counts.unknown += 1;
  }

  const ticketTypes = (Array.isArray(show?.ticketPrice?.ticketTypes)
    ? show.ticketPrice.ticketTypes
    : [])
    .filter(ticket => ticket?.active === true && ticket?.online === true)
    .map(ticket => ({
      name: ticket?.name || null,
      price: numeric(ticket?.price),
      concession: ticket?.concession === true
    }));
  const finitePrices = ticketTypes.map(ticket => ticket.price).filter(Number.isFinite);
  const adult = ticketPrice(ticketTypes, ["成人", "adult"]);
  const student = ticketPrice(ticketTypes, ["學生", "student"]);
  const child = ticketPrice(ticketTypes, ["小童", "兒童", "child"]);
  const senior = ticketPrice(ticketTypes, ["長者", "senior", "elder"]);
  const base = numeric(show?.price);
  const lowest = finitePrices.length ? Math.min(...finitePrices) : base;
  const display = Number.isFinite(adult) ? adult : Number.isFinite(base) ? base : lowest;
  const total = Object.keys(statuses).length;

  return {
    provider: "cineart",
    showSourceId: String(show?.id ?? props?.showId ?? ""),
    movieSourceId: show?.movie?.id != null ? String(show.movie.id) : null,
    price: Number.isFinite(display) || ticketTypes.length
      ? {
          currency: "HKD",
          display: Number.isFinite(display) ? display : null,
          adult,
          student,
          child,
          senior,
          face: base,
          lowest: Number.isFinite(lowest) ? lowest : null,
          ticketTypes,
          updatedAt: new Date(nowMs).toISOString()
        }
      : null,
    seatSummary: total > 0
      ? {
          quality: "strict-seat-state",
          total,
          available: counts.A,
          held: counts.H,
          sold: counts.U,
          blocked: counts.L,
          unavailable: counts.H + counts.U + counts.L,
          unknown: counts.unknown,
          updatedAt: new Date(nowMs).toISOString()
        }
      : null,
    seatStates: counts,
    readOnly: true,
    meta: {
      source: "cineart-next-flight-show",
      updatedAt: new Date(nowMs).toISOString()
    }
  };
}

export function createCineArtShowDetailService({
  fetchImpl = globalThis.fetch,
  cache = globalThis.caches?.default || null,
  now = () => Date.now(),
  timeoutMs = CINEART_SOURCE_CONFIG.timeoutMs,
  maxBytes = CINEART_SOURCE_CONFIG.maxBytes,
  ttlSeconds = DEFAULT_DETAIL_TTL_SECONDS
} = {}) {
  async function get(showId, movieId, { ctx = null } = {}) {
    const normalizedShowId = String(showId || "").trim();
    const normalizedMovieId = String(movieId || "").trim();
    if (!/^\d+$/.test(normalizedShowId) || !/^\d+$/.test(normalizedMovieId)) {
      throw serviceError("CINEART_DETAIL_INVALID_ID", "CineArt showId and movieId must be numeric", 400);
    }

    const suffix = `/${normalizedShowId}/${normalizedMovieId}`;
    const request = cacheRequest(DETAIL_CACHE_KEY, "fresh", suffix);
    const cached = await readCache(cache, request);
    if (cached?.showSourceId) return withCacheState(cached, "fresh-edge");

    const parsed = await fetchDetailParsed({
      fetchImpl,
      showId: normalizedShowId,
      movieId: normalizedMovieId,
      timeoutMs,
      maxBytes
    });
    const detail = normalizeCineArtShowDetail(parsed, { nowMs: now() });
    if (detail.showSourceId !== normalizedShowId) {
      throw serviceError("CINEART_DETAIL_SHOW_MISMATCH", "CineArt show detail did not match the requested show", 502);
    }

    if (cache?.put) {
      const write = cache.put(request, cacheResponse(detail, ttlSeconds));
      if (ctx?.waitUntil) ctx.waitUntil(write);
      else await write;
    }
    return withCacheState(detail, "network");
  }

  return Object.freeze({ get });
}

export const CINEART_SHOWTIME_CONFIG = Object.freeze({
  homeUrl: CINEART_SOURCE_CONFIG.homeUrl,
  timeoutMs: CINEART_SOURCE_CONFIG.timeoutMs,
  maxBytes: CINEART_SOURCE_CONFIG.maxBytes,
  freshTtlSeconds: DEFAULT_SHOWTIME_TTL_SECONDS,
  staleTtlSeconds: DEFAULT_SHOWTIME_STALE_SECONDS,
  detailTtlSeconds: DEFAULT_DETAIL_TTL_SECONDS
});
