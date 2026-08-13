import {
  parseCineArtHomePayload,
  parseCineArtShowPayload,
  resolveCineArtFlightTextReference
} from "./cineart-flight.js";

export const CINEART_HOME_URL = "https://cinearthouse.com.hk/hk";
const MEDIA_BASE = "https://media.grabticks.com/";
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

const CINEMA_MARKERS = Object.freeze([
  Object.freeze({ key: "megabox", patterns: ["MegaBox"] }),
  Object.freeze({ key: "maritime-square", patterns: ["青衣城", "Maritime Square"] }),
  Object.freeze({ key: "jp", patterns: ["翡翠明珠", "JP"] }),
  Object.freeze({ key: "hollywood", patterns: ["荷里活", "Hollywood"] }),
  Object.freeze({ key: "mostown", patterns: ["新港城中心", "MOSTown"] })
]);

function cineartError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  if (Number.isFinite(status)) error.status = status;
  return error;
}

function boundedPositiveInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function detectCinemas(text) {
  return CINEMA_MARKERS
    .filter(cinema => cinema.patterns.some(pattern => text.includes(pattern)))
    .map(cinema => cinema.key);
}

function hasProbeEvidence(text) {
  return /影藝戲院|CineArt/i.test(text) &&
    /\/_next\/|self\.__next_f\.push|__NEXT_DATA__/i.test(text) &&
    detectCinemas(text).length >= 3;
}

async function readBoundedText(response, maxBytes, { stopWhen = null } = {}) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) {
      throw cineartError(
        "CINEART_PAYLOAD_TOO_LARGE",
        `CineArt payload exceeded ${maxBytes} bytes`
      );
    }
    return { text, bytes, stoppedEarly: false };
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  let stoppedEarly = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("cineart-payload-too-large").catch(() => {});
        throw cineartError(
          "CINEART_PAYLOAD_TOO_LARGE",
          `CineArt payload exceeded ${maxBytes} bytes`
        );
      }
      text += decoder.decode(value, { stream: true });
      if (typeof stopWhen === "function" && stopWhen(text)) {
        stoppedEarly = true;
        await reader.cancel("cineart-evidence-found").catch(() => {});
        break;
      }
    }
    if (!stoppedEarly) text += decoder.decode();
    return { text, bytes, stoppedEarly };
  } finally {
    reader.releaseLock?.();
  }
}

async function fetchDocument({
  fetchImpl,
  url,
  timeoutMs,
  maxBytes,
  headers = {},
  stopWhen = null
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("cineart-worker-timeout"), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; HKCinemaCineArt/M7P1B)",
        ...headers
      }
    });

    if (!response.ok) {
      throw cineartError(
        "CINEART_HTTP_ERROR",
        `CineArt source returned HTTP ${response.status}`,
        response.status
      );
    }

    const sample = await readBoundedText(response, maxBytes, { stopWhen });
    return {
      ...sample,
      finalUrl: response.url || url
    };
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw cineartError("CINEART_TIMEOUT", "CineArt source request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
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

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function posterUrl(movie) {
  const image = Array.isArray(movie?.images) ? movie.images.find(Boolean) : null;
  if (!image) return null;
  const text = String(image).trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  return new URL(text, MEDIA_BASE).href;
}

function movieTitle(movie) {
  const value = localized(movie?.title_lang || movie?.name_lang, movie?.title || movie?.name || null);
  return { zh: value.zh, en: value.en };
}

function explicitFormats(movie, show = null) {
  return unique([
    ...splitValues(movie?.formats),
    ...splitValues(movie?.format),
    ...splitValues(movie?.version),
    ...splitValues(show?.formats),
    ...splitValues(show?.format),
    ...splitValues(show?.version)
  ]);
}

function normalizeMovie(movie, status) {
  const sourceId = String(movie?.id ?? "").trim();
  const language = localized(movie?.dialect_lang, movie?.dialect || null).zh;
  const subtitle = localized(movie?.subtitle_lang, movie?.subtitle || null).zh;
  return {
    id: `cineart:${sourceId}`,
    provider: "cineart",
    sourceId,
    title: movieTitle(movie),
    releaseDate: isoDate(movie?.openingDate),
    status,
    durationMinutes: numeric(movie?.duration),
    classification: movie?.category || null,
    languages: splitValues(language),
    subtitles: splitValues(subtitle),
    formats: explicitFormats(movie),
    director: splitValues(localized(movie?.director_lang, movie?.director || null).zh),
    cast: splitValues(localized(movie?.cast_lang, movie?.cast || null).zh),
    posterUrl: posterUrl(movie),
    trailerUrl: movie?.trailer || null,
    bookingUrl: null
  };
}

function cinemaName(site) {
  const value = localized(site?.name_lang, site?.name || null);
  return {
    zh: value.zh || site?.name || "影藝戲院",
    en: value.en || site?.name || "CineArt"
  };
}

export function normalizeCineArtHome(props, { nowMs = Date.now() } = {}) {
  const movies = Array.isArray(props?.movies) ? props.movies : [];
  const shows = Array.isArray(props?.shows) ? props.shows : [];
  const sites = Array.isArray(props?.showSites) ? props.showSites : [];
  const houses = Array.isArray(props?.houseList) ? props.houseList : [];
  const today = hongKongDate(nowMs);

  const movieMap = new Map(movies.map(movie => [String(movie?.id ?? ""), movie]));
  const siteMap = new Map(sites.map(site => [String(site?.id ?? ""), site]));
  const houseMap = new Map(houses.map(house => [String(house?.id ?? ""), house]));
  const activeShows = shows.filter(show => {
    const date = isoDate(show?.date);
    return Boolean(
      show?.id != null &&
      show?.movie?.id != null &&
      show?.site?.id != null &&
      show?.published !== false &&
      show?.hold !== true &&
      date &&
      date >= today
    );
  });

  const liveMovieIds = new Set(activeShows.map(show => String(show.movie.id)));
  const now = [];
  const coming = [];
  for (const movie of movies) {
    if (!movie || movie.active === false || movie.id == null) continue;
    const sourceId = String(movie.id);
    const releaseDate = isoDate(movie.openingDate);
    if (releaseDate && releaseDate > today) {
      coming.push(normalizeMovie(movie, "coming-soon"));
    } else if (liveMovieIds.has(sourceId)) {
      now.push(normalizeMovie(movie, "now-showing"));
    }
  }

  const sessions = activeShows.map(show => {
    const movieSourceId = String(show.movie.id);
    const movie = movieMap.get(movieSourceId) || show.movie || {};
    const site = siteMap.get(String(show.site.id)) || show.site || {};
    const house = houseMap.get(String(show?.house?.id ?? "")) || show.house || {};
    const total = numeric(show.seats);
    const sold = numeric(show.sold);
    const held = numeric(show.seatsHold);
    const notSold = numeric(show.avaliable);
    const basePrice = numeric(show.price);
    const language = localized(movie?.dialect_lang, movie?.dialect || null).zh;
    const subtitle = localized(movie?.subtitle_lang, movie?.subtitle || null).zh;

    return {
      sourceId: String(show.id),
      provider: "cineart",
      movieSourceId,
      cinema: {
        sourceId: String(site?.id ?? show.site.id),
        code: site?.code || null,
        name: cinemaName(site)
      },
      house: {
        sourceId: show?.house?.id != null ? String(show.house.id) : null,
        name: house?.name || show?.house?.name || null
      },
      date: isoDate(show.date),
      time: hongKongTime(show.time),
      startAt: show.time || null,
      languages: splitValues(language),
      subtitles: splitValues(subtitle),
      formats: explicitFormats(movie, show),
      price: Number.isFinite(basePrice)
        ? {
            currency: "HKD",
            display: basePrice,
            face: basePrice,
            updatedAt: new Date(nowMs).toISOString()
          }
        : null,
      seatSummary: [total, sold, held, notSold].some(Number.isFinite)
        ? {
            quality: "coarse-not-sold",
            total,
            available: null,
            held: null,
            sold,
            blocked: null,
            unavailable: sold,
            notSold,
            upstreamSeatsHold: held,
            updatedAt: new Date(nowMs).toISOString()
          }
        : null,
      bookingUrl: null
    };
  }).sort((left, right) =>
    String(left.date || "").localeCompare(String(right.date || "")) ||
    String(left.time || "").localeCompare(String(right.time || "")) ||
    String(left.cinema.sourceId || "").localeCompare(String(right.cinema.sourceId || ""))
  );

  return {
    provider: "cineart",
    catalogue: { now, coming, festival: [] },
    cinemas: sites.map(site => ({
      sourceId: site?.id != null ? String(site.id) : null,
      code: site?.code || null,
      name: cinemaName(site)
    })),
    sessions,
    meta: {
      source: "cineart-next-flight-home",
      sourceUrl: CINEART_HOME_URL,
      updatedAt: new Date(nowMs).toISOString(),
      counts: {
        sourceMovies: movies.length,
        sourceShows: shows.length,
        normalizedSessions: sessions.length,
        sites: sites.length,
        houses: houses.length
      }
    }
  };
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
  const base = numeric(show?.price);
  const adult = ticketPrice(ticketTypes, ["成人", "adult"]);
  const student = ticketPrice(ticketTypes, ["學生", "student"]);
  const child = ticketPrice(ticketTypes, ["小童", "兒童", "child"]);
  const senior = ticketPrice(ticketTypes, ["長者", "senior", "elder"]);
  const lowest = finitePrices.length ? Math.min(...finitePrices) : base;
  const display = Number.isFinite(adult) ? adult : Number.isFinite(base) ? base : lowest;
  const total = Object.keys(statuses).length;
  const seatPlan = resolveCineArtFlightTextReference(parsed?.flight || "", show?.plan?.config);

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
    seatPlan: {
      resolved: Boolean(seatPlan && typeof seatPlan === "object"),
      numSeats: numeric(seatPlan?.numSeats),
      blockCount: Array.isArray(seatPlan?.blocks) ? seatPlan.blocks.length : 0,
      width: numeric(seatPlan?.width),
      height: numeric(seatPlan?.height)
    },
    readOnly: true,
    meta: {
      source: "cineart-next-flight-show",
      updatedAt: new Date(nowMs).toISOString()
    }
  };
}

function showTimestamp(show) {
  const value = Date.parse(show?.time || "");
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function selectSampleShow(props, nowMs) {
  const shows = Array.isArray(props?.shows) ? props.shows : [];
  const eligible = shows.filter(show =>
    show?.id != null &&
    show?.movie?.id != null &&
    show?.site?.id != null &&
    show?.house?.id != null &&
    show?.published !== false &&
    show?.hold !== true
  );
  const future = eligible
    .filter(show => showTimestamp(show) >= nowMs)
    .sort((left, right) => showTimestamp(left) - showTimestamp(right));
  return future[0] || eligible[0] || null;
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

async function fetchShowParsed({ fetchImpl, show, timeoutMs, maxBytes }) {
  const showUrl = `${CINEART_HOME_URL}/show/${encodeURIComponent(show.id)}`;
  const direct = await fetchDocument({ fetchImpl, url: showUrl, timeoutMs, maxBytes });
  try {
    return { parsed: parseCineArtShowPayload(direct.text), transport: "document" };
  } catch {
    const rsc = await fetchDocument({
      fetchImpl,
      url: `${showUrl}?_rsc=hkcinema-m7p1b`,
      timeoutMs,
      maxBytes,
      headers: {
        Accept: "*/*",
        RSC: "1",
        "Next-Url": `/hk/movie/${show.movie.id}`,
        "Next-Router-State-Tree": encodedRouterState(show.movie.id)
      }
    });
    return { parsed: parseCineArtShowPayload(rsc.text), transport: "rsc" };
  }
}

export async function getCineArtWorkerSnapshot({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  now = () => Date.now()
} = {}) {
  const boundedTimeout = boundedPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 500, DEFAULT_TIMEOUT_MS);
  const boundedMaxBytes = boundedPositiveInteger(maxBytes, DEFAULT_MAX_BYTES, 64 * 1024, DEFAULT_MAX_BYTES);
  const home = await fetchDocument({
    fetchImpl,
    url: CINEART_HOME_URL,
    timeoutMs: boundedTimeout,
    maxBytes: boundedMaxBytes
  });
  const parsed = parseCineArtHomePayload(home.text);
  return {
    props: parsed.props,
    normalized: normalizeCineArtHome(parsed.props, { nowMs: now() }),
    transport: {
      source: "cineart-next-flight-home",
      bytes: home.bytes,
      finalUrl: home.finalUrl
    }
  };
}

export async function discoverCineArt({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  now = () => Date.now()
} = {}) {
  const nowMs = now();
  const snapshot = await getCineArtWorkerSnapshot({ fetchImpl, timeoutMs, maxBytes, now: () => nowMs });
  const sample = selectSampleShow(snapshot.props, nowMs);
  if (!sample) {
    throw cineartError("CINEART_EMPTY", "CineArt home payload contained no usable showtime sample");
  }

  const detailResult = await fetchShowParsed({
    fetchImpl,
    show: sample,
    timeoutMs: boundedPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 500, DEFAULT_TIMEOUT_MS),
    maxBytes: boundedPositiveInteger(maxBytes, DEFAULT_MAX_BYTES, 64 * 1024, DEFAULT_MAX_BYTES)
  });
  const detail = normalizeCineArtShowDetail(detailResult.parsed, { nowMs });
  const normalizedSample = snapshot.normalized.sessions.find(
    session => session.sourceId === String(sample.id)
  ) || null;
  const dates = snapshot.normalized.sessions.map(session => session.date).filter(Boolean).sort();
  const sessionWithPrice = snapshot.normalized.sessions.filter(session => Number.isFinite(session?.price?.display)).length;
  const sessionWithCoarseSeats = snapshot.normalized.sessions.filter(session => session?.seatSummary).length;
  const languageCount = snapshot.normalized.sessions.filter(session => session.languages.length > 0).length;
  const subtitleCount = snapshot.normalized.sessions.filter(session => session.subtitles.length > 0).length;
  const formatCount = snapshot.normalized.sessions.filter(session => session.formats.length > 0).length;

  const strict = detail.seatSummary;
  const coarse = normalizedSample?.seatSummary || null;
  return {
    provider: "cineart",
    mode: "m7p1b-worker-adapter-discovery",
    home: {
      source: snapshot.transport.source,
      sourceUrl: CINEART_HOME_URL,
      bytes: snapshot.transport.bytes,
      movieCount: Number(snapshot.normalized.meta.counts.sourceMovies || 0),
      showCount: Number(snapshot.normalized.meta.counts.sourceShows || 0),
      normalizedShowCount: snapshot.normalized.sessions.length,
      cinemaCount: snapshot.normalized.cinemas.length,
      cinemas: snapshot.normalized.cinemas,
      catalogue: {
        now: snapshot.normalized.catalogue.now.length,
        coming: snapshot.normalized.catalogue.coming.length
      },
      dateRange: {
        from: dates[0] || null,
        to: dates.at(-1) || null
      },
      sampleShow: normalizedSample
        ? {
            sourceId: normalizedSample.sourceId,
            movieSourceId: normalizedSample.movieSourceId,
            cinemaSourceId: normalizedSample.cinema.sourceId,
            houseSourceId: normalizedSample.house.sourceId,
            date: normalizedSample.date,
            time: normalizedSample.time,
            basePrice: normalizedSample.price?.display ?? null,
            coarseSeatSummary: coarse
          }
        : null
    },
    detail: {
      transport: detailResult.transport,
      showSourceId: detail.showSourceId,
      movieSourceId: detail.movieSourceId,
      price: detail.price,
      seatSummary: detail.seatSummary,
      seatPlan: detail.seatPlan,
      readOnly: detail.readOnly
    },
    correlation: {
      showIdMatches: detail.showSourceId === String(sample.id),
      movieIdMatches: detail.movieSourceId === String(sample.movie.id),
      seatTotalMatches: Boolean(strict && coarse && strict.total === coarse.total),
      soldMatches: Boolean(strict && coarse && Number.isFinite(coarse.sold) && strict.sold === coarse.sold),
      notSoldMatches: Boolean(
        strict &&
        coarse &&
        Number.isFinite(coarse.notSold) &&
        strict.available + strict.held + strict.blocked === coarse.notSold
      )
    },
    capabilities: {
      catalogue: snapshot.normalized.catalogue.now.length + snapshot.normalized.catalogue.coming.length > 0,
      cinemaList: snapshot.normalized.cinemas.length > 0,
      showtimes: snapshot.normalized.sessions.length > 0,
      basePrice: sessionWithPrice > 0,
      detailedPrices: Array.isArray(detail.price?.ticketTypes) && detail.price.ticketTypes.length > 0,
      coarseSeatSummary: sessionWithCoarseSeats > 0,
      strictSeatSummary: Boolean(detail.seatSummary && Number.isFinite(detail.seatSummary.available)),
      seatMapReadOnly: detail.readOnly === true && detail.seatPlan.resolved === true,
      languageMetadata: languageCount > 0,
      subtitleMetadata: subtitleCount > 0,
      formatMetadata: formatCount > 0,
      booking: false
    }
  };
}

export async function probeCineArt({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES
} = {}) {
  const boundedTimeout = boundedPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 500, DEFAULT_TIMEOUT_MS);
  const boundedMaxBytes = boundedPositiveInteger(maxBytes, DEFAULT_MAX_BYTES, 64 * 1024, DEFAULT_MAX_BYTES);
  const sample = await fetchDocument({
    fetchImpl,
    url: CINEART_HOME_URL,
    timeoutMs: boundedTimeout,
    maxBytes: boundedMaxBytes,
    stopWhen: hasProbeEvidence
  });
  const cinemas = detectCinemas(sample.text);
  if (!hasProbeEvidence(sample.text)) {
    throw cineartError(
      "CINEART_INVALID_PAYLOAD",
      "CineArt probe response did not contain the expected site/Next.js evidence"
    );
  }
  return {
    evidence: "site-shell-cinema-directory",
    source: "cinearthouse-hk",
    cinemaCount: cinemas.length,
    cinemas,
    nextJsDetected: true,
    bytesRead: sample.bytes,
    stoppedEarly: sample.stoppedEarly,
    finalUrl: sample.finalUrl
  };
}

export const CINEART_WORKER_CONFIG = Object.freeze({
  homeUrl: CINEART_HOME_URL,
  mediaBase: MEDIA_BASE,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxBytes: DEFAULT_MAX_BYTES,
  cinemaMarkers: CINEMA_MARKERS
});
