const BASE_URL = String(process.env.HK_CINEMA_CANDIDATE_WORKER_URL || "")
  .trim()
  .replace(/\/+$/, "");
const PROBE_MAX_ATTEMPTS = 12;
const DISCOVERY_MAX_ATTEMPTS = 3;
const CATALOGUE_MAX_ATTEMPTS = 3;
const SHOWTIME_MAX_ATTEMPTS = 3;
const RETRY_MS = 5000;

if (!BASE_URL) {
  throw new Error("HK_CINEMA_CANDIDATE_WORKER_URL is required");
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(endpoint, timeoutMs = 20000) {
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let payload = null;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }

  return payload;
}

async function validateProbe() {
  const endpoint = `${BASE_URL}/api/providers/probe/cineart`;
  let lastFailure = "no attempt completed";

  for (let attempt = 1; attempt <= PROBE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = await fetchJson(endpoint, 10000);
      const result = payload?.data;

      if (
        result?.provider !== "cineart" ||
        result?.healthy !== true ||
        result?.evidence?.source !== "cinearthouse-hk" ||
        result?.evidence?.evidence !== "site-shell-cinema-directory" ||
        Number(result?.evidence?.cinemaCount) < 3
      ) {
        throw new Error(`unhealthy/invalid CineArt probe: ${JSON.stringify(result)}`);
      }

      return {
        ok: true,
        endpoint,
        attempt,
        provider: result.provider,
        latencyMs: result.latencyMs,
        cinemaCount: result.evidence.cinemaCount,
        cinemas: result.evidence.cinemas,
        nextJsDetected: result.evidence.nextJsDetected,
        checkedAt: result.checkedAt
      };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (attempt < PROBE_MAX_ATTEMPTS) {
        console.log(
          `CineArt probe attempt ${attempt}/${PROBE_MAX_ATTEMPTS} not ready: ${lastFailure}`
        );
        await sleep(RETRY_MS);
      }
    }
  }

  throw new Error(
    `CineArt branch-preview probe failed after ${PROBE_MAX_ATTEMPTS} attempts: ${lastFailure}`
  );
}

async function validateDiscovery() {
  const endpoint = `${BASE_URL}/api/providers/cineart/discovery`;
  let lastFailure = "no attempt completed";

  for (let attempt = 1; attempt <= DISCOVERY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = await fetchJson(endpoint, 25000);
      const result = payload?.data;
      const capabilities = result?.capabilities || {};
      const home = result?.home || {};
      const detail = result?.detail || {};

      if (
        result?.provider !== "cineart" ||
        result?.mode !== "m7b-data-source-discovery" ||
        home?.source !== "cineart-next-flight-home" ||
        Number(home?.movieCount) < 1 ||
        Number(home?.showCount) < 1 ||
        Number(home?.siteCount) < 5 ||
        Number(home?.showtimePriceCount) < 1 ||
        Number(home?.seatSummaryCount) < 1 ||
        detail?.source !== "cineart-next-flight-show" ||
        Number(detail?.ticketTypeCount) < 1 ||
        Number(detail?.seatStatusCount) < 1 ||
        detail?.seatPlan?.resolved !== true ||
        capabilities?.catalogue !== true ||
        capabilities?.showtimes !== true ||
        capabilities?.showtimePrice !== true ||
        capabilities?.seatSummary !== true ||
        capabilities?.ticketTypes !== true ||
        capabilities?.seatMapReadOnly !== true
      ) {
        throw new Error(`invalid CineArt M7B discovery: ${JSON.stringify(result)}`);
      }

      return {
        ok: true,
        endpoint,
        attempt,
        provider: result.provider,
        movieCount: home.movieCount,
        showCount: home.showCount,
        siteCount: home.siteCount,
        houseCount: home.houseCount,
        dateRange: home.dateRange,
        sampleShow: home.sampleShow,
        ticketTypeCount: detail.ticketTypeCount,
        seatStatusCount: detail.seatStatusCount,
        seatStatusCounts: detail.seatStatusCounts,
        seatPlan: detail.seatPlan,
        correlation: result.correlation,
        capabilities
      };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (attempt < DISCOVERY_MAX_ATTEMPTS) {
        console.log(
          `CineArt discovery attempt ${attempt}/${DISCOVERY_MAX_ATTEMPTS} failed: ${lastFailure}`
        );
        await sleep(RETRY_MS);
      }
    }
  }

  throw new Error(
    `CineArt branch-preview discovery failed after ${DISCOVERY_MAX_ATTEMPTS} attempts: ${lastFailure}`
  );
}

async function validateCatalogue() {
  const endpoint = `${BASE_URL}/api/cineart/catalogue`;
  let lastFailure = "no attempt completed";

  for (let attempt = 1; attempt <= CATALOGUE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = await fetchJson(endpoint, 15000);
      const catalogue = payload?.data;
      const meta = payload?.meta || {};
      const now = catalogue?.now;
      const coming = catalogue?.coming;
      const counts = catalogue?.meta?.counts || {};
      const cacheState = String(meta.cacheState || catalogue?.meta?.cacheState || "");

      if (
        meta?.provider !== "cineart" ||
        !Array.isArray(now) ||
        !Array.isArray(coming) ||
        now.length + coming.length < 1 ||
        Number(counts?.sourceMovies) < 1 ||
        Number(counts?.sourceShows) < 1 ||
        !["network", "fresh-edge", "stale-edge"].includes(cacheState) ||
        [...now, ...coming].some(movie =>
          movie?.provider !== "cineart" ||
          !String(movie?.sourceId || "").trim() ||
          !String(movie?.title?.zh || movie?.title?.en || "").trim()
        )
      ) {
        throw new Error(`invalid CineArt M7C catalogue: ${JSON.stringify(payload)}`);
      }

      const sampleMovie = now.find(movie => /^\d+$/.test(String(movie?.sourceId || ""))) ||
        coming.find(movie => /^\d+$/.test(String(movie?.sourceId || "")));
      if (!sampleMovie) throw new Error("CineArt catalogue exposed no numeric movie source ID");

      return {
        ok: true,
        endpoint,
        attempt,
        provider: meta.provider,
        nowCount: now.length,
        comingCount: coming.length,
        sourceMovieCount: counts.sourceMovies,
        sourceShowCount: counts.sourceShows,
        siteCount: counts.sites,
        houseCount: counts.houses,
        sampleMovieId: String(sampleMovie.sourceId),
        sampleMovieTitle: sampleMovie.title?.zh || sampleMovie.title?.en || null,
        cacheState,
        stale: meta.stale === true,
        updatedAt: meta.updatedAt
      };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (attempt < CATALOGUE_MAX_ATTEMPTS) {
        console.log(
          `CineArt catalogue attempt ${attempt}/${CATALOGUE_MAX_ATTEMPTS} failed: ${lastFailure}`
        );
        await sleep(RETRY_MS);
      }
    }
  }

  throw new Error(
    `CineArt branch-preview catalogue failed after ${CATALOGUE_MAX_ATTEMPTS} attempts: ${lastFailure}`
  );
}

async function validateShowtime(movieId) {
  const endpoint = `${BASE_URL}/api/cineart/movies/${encodeURIComponent(movieId)}/shows`;
  let lastFailure = "no attempt completed";

  for (let attempt = 1; attempt <= SHOWTIME_MAX_ATTEMPTS; attempt += 1) {
    try {
      const payload = await fetchJson(endpoint, 18000);
      const result = payload?.data || {};
      const meta = payload?.meta || {};
      const sessions = Array.isArray(result.sessions) ? result.sessions : [];
      const allSessions = Array.isArray(result.allSessions) ? result.allSessions : [];
      const availableDates = Array.isArray(result.availableDates) ? result.availableDates : [];
      const sample = sessions.find(session => /^\d+$/.test(String(session?.sourceId || "")));
      const cacheState = String(meta.cacheState || result?.meta?.cacheState || "");

      if (
        meta?.provider !== "cineart" ||
        meta?.mode !== "normalized-showtimes" ||
        availableDates.length < 1 ||
        sessions.length < 1 ||
        allSessions.length < sessions.length ||
        !sample ||
        String(sample.movieSourceId) !== String(movieId) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(sample.date || "")) ||
        !/^\d{2}:\d{2}$/.test(String(sample.time || "")) ||
        !String(sample?.cinema?.name?.zh || sample?.cinema?.name?.en || "").trim() ||
        sample?.bookingUrl !== null ||
        sample?.seatSummary?.quality !== "coarse-not-sold" ||
        sample?.seatSummary?.available !== null ||
        !Number.isFinite(Number(sample?.price?.display)) ||
        !["network", "fresh-edge", "stale-edge"].includes(cacheState)
      ) {
        throw new Error(`invalid CineArt M7D showtimes: ${JSON.stringify(payload)}`);
      }

      const detailEndpoint = `${BASE_URL}/api/cineart/shows/${encodeURIComponent(sample.sourceId)}/detail?movieId=${encodeURIComponent(movieId)}`;
      const detailPayload = await fetchJson(detailEndpoint, 20000);
      const detail = detailPayload?.data || {};
      const detailMeta = detailPayload?.meta || {};
      const seat = detail?.seatSummary || {};
      const price = detail?.price || {};

      if (
        detailMeta?.provider !== "cineart" ||
        detailMeta?.mode !== "lazy-show-detail" ||
        String(detail?.showSourceId) !== String(sample.sourceId) ||
        detail?.readOnly !== true ||
        seat?.quality !== "strict-seat-state" ||
        !Number.isFinite(Number(seat?.total)) ||
        !Number.isFinite(Number(seat?.available)) ||
        !Number.isFinite(Number(seat?.held)) ||
        !Number.isFinite(Number(seat?.sold)) ||
        !Number.isFinite(Number(seat?.blocked)) ||
        !Number.isFinite(Number(price?.display)) ||
        !Array.isArray(price?.ticketTypes) ||
        price.ticketTypes.length < 1
      ) {
        throw new Error(`invalid CineArt M7D detail: ${JSON.stringify(detailPayload)}`);
      }

      return {
        ok: true,
        endpoint,
        detailEndpoint,
        attempt,
        provider: meta.provider,
        movieId: String(movieId),
        selectedDate: result.selectedDate,
        availableDateCount: availableDates.length,
        sessionCount: sessions.length,
        allSessionCount: allSessions.length,
        sampleShowId: String(sample.sourceId),
        sampleCinema: sample?.cinema?.name?.zh || sample?.cinema?.name?.en || null,
        sampleTime: sample.time,
        basePrice: sample?.price?.display ?? null,
        coarseSeats: {
          total: sample?.seatSummary?.total ?? null,
          sold: sample?.seatSummary?.sold ?? null,
          coarseRemaining: sample?.seatSummary?.coarseRemaining ?? null,
          selectable: sample?.seatSummary?.available ?? null
        },
        strictSeats: seat,
        ticketTypeCount: price.ticketTypes.length,
        adultPrice: price.adult ?? price.display ?? null,
        showtimeCacheState: cacheState,
        detailCacheState: detailMeta.cacheState || detail?.meta?.cacheState || "network"
      };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (attempt < SHOWTIME_MAX_ATTEMPTS) {
        console.log(
          `CineArt M7D attempt ${attempt}/${SHOWTIME_MAX_ATTEMPTS} failed: ${lastFailure}`
        );
        await sleep(RETRY_MS);
      }
    }
  }

  throw new Error(
    `CineArt branch-preview M7D failed after ${SHOWTIME_MAX_ATTEMPTS} attempts: ${lastFailure}`
  );
}

const probe = await validateProbe();
console.log(JSON.stringify({ gate: "M7A", ...probe }, null, 2));

const discovery = await validateDiscovery();
console.log(JSON.stringify({ gate: "M7B", ...discovery }, null, 2));

const catalogue = await validateCatalogue();
console.log(JSON.stringify({ gate: "M7C", ...catalogue }, null, 2));

const showtime = await validateShowtime(catalogue.sampleMovieId);
console.log(JSON.stringify({ gate: "M7D", ...showtime }, null, 2));
