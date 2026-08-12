import { appendFile, writeFile } from "node:fs/promises";

const BASE_URL = String(
  process.env.HK_CINEMA_WORKER_URL || "https://hk-cinema-api.max-yu-jp.workers.dev"
).trim().replace(/\/+$/, "");
const REPORT_PATH = process.env.M7E_CINEART_REPORT || "m7e-cineart-production.json";
const MAX_ATTEMPTS = 3;
const RETRY_MS = 4_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(endpoint, timeoutMs = 20_000) {
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/json",
      "user-agent": "HKCinema-M7E-Production-Validation/1"
    }
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${endpoint} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error?.message || `${endpoint} returned HTTP ${response.status}`);
  }
  return {
    payload,
    status: response.status,
    latencyMs: Date.now() - started,
    cacheControl: response.headers.get("cache-control")
  };
}

async function withRetries(label, operation) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return { attempt, value: await operation() };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        console.log(`${label} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error instanceof Error ? error.message : String(error)}`);
        await sleep(RETRY_MS);
      }
    }
  }
  throw lastError || new Error(`${label} failed`);
}

function numeric(value) {
  return Number.isFinite(Number(value));
}

const checkedAt = new Date().toISOString();

const catalogueAttempt = await withRetries("CineArt production catalogue", async () => {
  const endpoint = `${BASE_URL}/api/cineart/catalogue`;
  const response = await fetchJson(endpoint, 18_000);
  const catalogue = response.payload?.data || {};
  const meta = response.payload?.meta || {};
  const now = Array.isArray(catalogue.now) ? catalogue.now : [];
  const coming = Array.isArray(catalogue.coming) ? catalogue.coming : [];
  const sampleMovie = now.find(movie => /^\d+$/.test(String(movie?.sourceId || "")));
  const cacheState = String(meta.cacheState || catalogue?.meta?.cacheState || "");

  if (
    meta.provider !== "cineart" ||
    now.length + coming.length < 1 ||
    !sampleMovie ||
    !["network", "fresh-edge", "stale-edge"].includes(cacheState)
  ) {
    throw new Error(`invalid production catalogue contract: ${JSON.stringify(response.payload)}`);
  }

  return {
    endpoint,
    response,
    nowCount: now.length,
    comingCount: coming.length,
    sourceMovieCount: catalogue?.meta?.counts?.sourceMovies ?? null,
    sourceShowCount: catalogue?.meta?.counts?.sourceShows ?? null,
    sampleMovieId: String(sampleMovie.sourceId),
    sampleMovieTitle: sampleMovie?.title?.zh || sampleMovie?.title?.en || null,
    cacheState,
    stale: meta.stale === true,
    updatedAt: meta.updatedAt || catalogue?.meta?.updatedAt || null
  };
});

const catalogue = catalogueAttempt.value;

const showtimeAttempt = await withRetries("CineArt production showtimes/detail", async () => {
  const endpoint = `${BASE_URL}/api/cineart/movies/${encodeURIComponent(catalogue.sampleMovieId)}/shows`;
  const response = await fetchJson(endpoint, 20_000);
  const result = response.payload?.data || {};
  const meta = response.payload?.meta || {};
  const sessions = Array.isArray(result.sessions) ? result.sessions : [];
  const allSessions = Array.isArray(result.allSessions) ? result.allSessions : [];
  const availableDates = Array.isArray(result.availableDates) ? result.availableDates : [];
  const sample = sessions.find(session => /^\d+$/.test(String(session?.sourceId || "")));
  const cacheState = String(meta.cacheState || result?.meta?.cacheState || "");

  if (
    meta.provider !== "cineart" ||
    meta.mode !== "normalized-showtimes" ||
    availableDates.length < 1 ||
    sessions.length < 1 ||
    allSessions.length < sessions.length ||
    !sample ||
    String(sample.movieSourceId) !== catalogue.sampleMovieId ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(sample.date || "")) ||
    !/^\d{2}:\d{2}$/.test(String(sample.time || "")) ||
    sample.bookingUrl !== null ||
    sample?.seatSummary?.quality !== "coarse-not-sold" ||
    sample?.seatSummary?.available !== null ||
    !numeric(sample?.price?.display) ||
    !["network", "fresh-edge", "stale-edge"].includes(cacheState)
  ) {
    throw new Error(`invalid production showtime contract: ${JSON.stringify(response.payload)}`);
  }

  const detailEndpoint = `${BASE_URL}/api/cineart/shows/${encodeURIComponent(sample.sourceId)}/detail?movieId=${encodeURIComponent(catalogue.sampleMovieId)}`;
  const detailResponse = await fetchJson(detailEndpoint, 22_000);
  const detail = detailResponse.payload?.data || {};
  const detailMeta = detailResponse.payload?.meta || {};
  const seat = detail.seatSummary || {};
  const price = detail.price || {};

  if (
    detailMeta.provider !== "cineart" ||
    detailMeta.mode !== "lazy-show-detail" ||
    String(detail.showSourceId) !== String(sample.sourceId) ||
    detail.readOnly !== true ||
    seat.quality !== "strict-seat-state" ||
    !numeric(seat.total) ||
    !numeric(seat.available) ||
    !numeric(seat.held) ||
    !numeric(seat.sold) ||
    !numeric(seat.blocked) ||
    Number(seat.available) > Number(seat.total) ||
    !numeric(price.display) ||
    !Array.isArray(price.ticketTypes) ||
    price.ticketTypes.length < 1
  ) {
    throw new Error(`invalid production lazy-detail contract: ${JSON.stringify(detailResponse.payload)}`);
  }

  return {
    endpoint,
    detailEndpoint,
    response,
    detailResponse,
    selectedDate: result.selectedDate,
    availableDateCount: availableDates.length,
    sessionCount: sessions.length,
    allSessionCount: allSessions.length,
    sampleShowId: String(sample.sourceId),
    sampleCinema: sample?.cinema?.name?.zh || sample?.cinema?.name?.en || null,
    sampleTime: sample.time,
    basePrice: Number(sample.price.display),
    showtimeCacheState: cacheState,
    strictSeats: {
      total: Number(seat.total),
      available: Number(seat.available),
      held: Number(seat.held),
      sold: Number(seat.sold),
      blocked: Number(seat.blocked)
    },
    ticketTypeCount: price.ticketTypes.length,
    adultPrice: Number(price.adult ?? price.display),
    detailCacheState: detailMeta.cacheState || detail?.meta?.cacheState || "network"
  };
});

const showtime = showtimeAttempt.value;
const report = {
  phase: "M7E",
  checkedAt,
  workerBase: BASE_URL,
  catalogue: {
    ok: true,
    attempt: catalogueAttempt.attempt,
    endpoint: catalogue.endpoint,
    status: catalogue.response.status,
    latencyMs: catalogue.response.latencyMs,
    cacheControl: catalogue.response.cacheControl,
    nowCount: catalogue.nowCount,
    comingCount: catalogue.comingCount,
    sourceMovieCount: catalogue.sourceMovieCount,
    sourceShowCount: catalogue.sourceShowCount,
    sampleMovieId: catalogue.sampleMovieId,
    sampleMovieTitle: catalogue.sampleMovieTitle,
    cacheState: catalogue.cacheState,
    stale: catalogue.stale,
    updatedAt: catalogue.updatedAt
  },
  showtime: {
    ok: true,
    attempt: showtimeAttempt.attempt,
    endpoint: showtime.endpoint,
    detailEndpoint: showtime.detailEndpoint,
    status: showtime.response.status,
    detailStatus: showtime.detailResponse.status,
    latencyMs: showtime.response.latencyMs,
    detailLatencyMs: showtime.detailResponse.latencyMs,
    selectedDate: showtime.selectedDate,
    availableDateCount: showtime.availableDateCount,
    sessionCount: showtime.sessionCount,
    allSessionCount: showtime.allSessionCount,
    sampleShowId: showtime.sampleShowId,
    sampleCinema: showtime.sampleCinema,
    sampleTime: showtime.sampleTime,
    basePrice: showtime.basePrice,
    showtimeCacheState: showtime.showtimeCacheState,
    strictSeats: showtime.strictSeats,
    ticketTypeCount: showtime.ticketTypeCount,
    adultPrice: showtime.adultPrice,
    detailCacheState: showtime.detailCacheState
  }
};

await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const summary = [
  "## HK Cinema M7E CineArt production validation",
  "",
  `- Catalogue: **healthy** — ${report.catalogue.nowCount} now / ${report.catalogue.comingCount} coming`,
  `- Sample movie: \`${report.catalogue.sampleMovieId}\` ${report.catalogue.sampleMovieTitle || ""}`,
  `- Showtimes: **healthy** — ${report.showtime.sessionCount} selected-date sessions / ${report.showtime.availableDateCount} dates`,
  `- GET-only detail: **healthy** — ${report.showtime.ticketTypeCount} ticket types`,
  `- Strict seats: **${report.showtime.strictSeats.available}/${report.showtime.strictSeats.total} selectable**`,
  `- Adult price: **HK$${report.showtime.adultPrice}**`,
  "",
  `Structured report: \`${REPORT_PATH}\``
].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`, "utf8");
}

console.log(summary);
