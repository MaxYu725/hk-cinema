import {
  getBroadwayMovies,
  getBroadwayUpcoming
} from "./providers/broadway.js";
import { getBroadwayMovieShows } from "./providers/broadway-shows.js";
import { getBroadwaySeatMap } from "./providers/broadway-seats.js";
import { getMCLTicketing } from "./providers/mcl-ticketing.js";
import { getMCLSeatMap } from "./providers/mcl-seats.js";
import {
  getEmperorMovies,
  getEmperorUpcoming,
  getEmperorMovieShows,
  probeEmperor
} from "./providers/emperor.js";
import { getEmperorSeatMap } from "./providers/emperor-seat-bounds.js";
import { discoverCineArt } from "./providers/cineart.js";
import { cineArtCatalogueService } from "./providers/cineart-catalogue.js";
import { cineArtShowtimeService } from "./providers/cineart-showtimes.js";
import { cineArtSeatMapService } from "./providers/cineart-seatmap.js";
import {
  providerProbeRunner,
  SUPPORTED_PROVIDERS
} from "./provider-probe.js";
import { providerHealthMap } from "./provider-manifest.js";

const HEALTH_SCHEMA_VERSION = 2;
const LEGACY_HEALTH_PHASE = "6G";
const GEOMETRY_VERSION = "6e1-bounds-v2";
export const PUBLIC_CACHE_CONTROL = "no-store";

export const CACHE_OWNERS = Object.freeze({
  catalogue: "provider-adapter",
  showtimes: "comparison-service",
  price: "enrichment-service",
  seatSummary: "enrichment-service",
  seatMap: "seat-map-service",
  cineartUpstreamSnapshot: "cineart-worker-service",
  shell: "service-worker"
});

export const json = (data, status = 200, extraHeaders = {}) => {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    ...extraHeaders
  });
  headers.set("cache-control", PUBLIC_CACHE_CONTROL);
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers
  });
};

function textOrNull(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function deploymentMetadata(env) {
  return {
    versionId: textOrNull(env?.CF_VERSION_METADATA?.id),
    versionTag: textOrNull(env?.CF_VERSION_METADATA?.tag),
    createdAt: textOrNull(env?.CF_VERSION_METADATA?.timestamp)
  };
}

function errorBody(error, fallbackCode, extra = {}) {
  return {
    ok: false,
    error: {
      code: error?.code || fallbackCode,
      message: error instanceof Error ? error.message : String(error),
      ...extra
    }
  };
}

function errorResponse(error, fallbackCode, status = null, extra = {}) {
  const resolvedStatus = Number.isFinite(status)
    ? status
    : Number.isFinite(error?.status)
      ? error.status
      : 502;
  return json(errorBody(error, fallbackCode, extra), resolvedStatus);
}

function invalid(code, message, status = 400) {
  return json({ ok: false, error: { code, message } }, status);
}

function methodNotAllowed(route) {
  return json({
    ok: false,
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: `${route.label || route.id} is read-only`
    }
  }, 405, { allow: "GET" });
}

function exact(id, pathname, handler, options = {}) {
  return Object.freeze({
    id,
    label: options.label || id,
    errorCode: options.errorCode || "ROUTE_ERROR",
    match(url) {
      return url.pathname === pathname ? [] : null;
    },
    handler
  });
}

function pattern(id, matcher, handler, options = {}) {
  return Object.freeze({
    id,
    label: options.label || id,
    errorCode: options.errorCode || "ROUTE_ERROR",
    match(url) {
      return url.pathname.match(matcher);
    },
    handler
  });
}

const routes = [
  exact("health", "/health", async ({ env }) => json({
    ok: true,
    service: "hk-cinema-api",
    schemaVersion: HEALTH_SCHEMA_VERSION,
    phase: LEGACY_HEALTH_PHASE,
    status: "operational",
    providers: providerHealthMap(),
    deployment: deploymentMetadata(env),
    freshness: {
      catalogueFallbackMaxAgeSeconds: 86400,
      comparisonFreshSeconds: 90,
      comparisonStaleSeconds: 600,
      priceFreshSeconds: 300,
      seatSummaryFreshSeconds: 90,
      seatMapFreshSeconds: 30
    },
    cacheOwners: CACHE_OWNERS,
    time: new Date().toISOString()
  })),

  exact("providers-probe-all", "/api/providers/probe", async () => {
    const result = await providerProbeRunner.probeAll();
    return json({
      ok: true,
      data: result,
      meta: {
        phase: "M7R1",
        mode: "live-provider-probe",
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "PROVIDER_PROBE_ERROR" }),

  pattern("providers-probe-one", /^\/api\/providers\/probe\/([^/]+)$/, async ({ match }) => {
    const provider = decodeURIComponent(match[1]).toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return invalid(
        "INVALID_PROVIDER",
        `provider is not registered; available providers: ${SUPPORTED_PROVIDERS.join(", ")}`
      );
    }
    const result = await providerProbeRunner.probeProvider(provider);
    return json({
      ok: true,
      data: result,
      meta: {
        phase: "M7R1",
        mode: "live-provider-probe",
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "PROVIDER_PROBE_ERROR" }),

  exact("emperor-probe-health", "/api/emperor/health", emperorProbe, {
    errorCode: "EMPEROR_PROBE_ERROR"
  }),
  exact("emperor-probe-legacy", "/api/emperor/probe", emperorProbe, {
    errorCode: "EMPEROR_PROBE_ERROR"
  }),
  exact("emperor-seatmap-health", "/api/emperor/seatmap-health", async () => json({
    ok: true,
    data: {
      provider: "emperor",
      phase: "6G",
      geometryVersion: GEOMETRY_VERSION
    },
    meta: { updatedAt: new Date().toISOString() }
  })),

  exact("broadway-catalogue-current", "/api/broadway/movies", async () => {
    const result = await getBroadwayMovies();
    return json({
      ok: true,
      data: result.movies,
      meta: {
        provider: "broadway",
        count: result.movies.length,
        source: result.source,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "BROADWAY_PARSE_ERROR" }),

  exact("broadway-catalogue-upcoming", "/api/broadway/upcoming", async () => {
    const result = await getBroadwayUpcoming();
    return json({
      ok: true,
      data: result.movies,
      meta: {
        provider: "broadway",
        type: "coming-soon",
        count: result.movies.length,
        source: result.source,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "BROADWAY_UPCOMING_PARSE_ERROR" }),

  pattern("broadway-showtimes", /^\/api\/broadway\/movies\/([^/]+)\/shows$/, async ({ url, match }) => {
    const movieId = decodeURIComponent(match[1]);
    const date = validDate(url.searchParams.get("date"));
    if (date.error) return date.error;
    const result = await getBroadwayMovieShows(movieId, date.value);
    if (!result) return invalid("MOVIE_NOT_FOUND", "Broadway movie not found", 404);
    return json({
      ok: true,
      data: {
        movie: result.movie,
        availableDates: result.availableDates,
        selectedDate: result.selectedDate,
        sessions: result.sessions
      },
      meta: {
        provider: "broadway",
        source: result.source,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "BROADWAY_SHOWS_PARSE_ERROR" }),

  pattern("broadway-seatmap", /^\/api\/broadway\/shows\/([^/]+)\/seats$/, async ({ match }) => {
    const showId = decodeURIComponent(match[1]);
    const result = await getBroadwaySeatMap(showId);
    return json({
      ok: true,
      data: result,
      meta: {
        provider: "broadway",
        showId: result.showId,
        updatedAt: result.updatedAt
      }
    });
  }, { errorCode: "BROADWAY_SEATMAP_PARSE_ERROR" }),

  exact("mcl-ticketing", "/api/mcl/ticketing", async ({ url }) => {
    const movieSetId = url.searchParams.get("movieSetId");
    const date = validDate(url.searchParams.get("date"));
    if (!movieSetId || !/^\d+$/.test(movieSetId)) {
      return invalid("INVALID_MCL_MOVIE_ID", "movieSetId must be numeric");
    }
    if (date.error) return date.error;
    try {
      const result = await getMCLTicketing(movieSetId, date.value);
      return json({
        ok: true,
        data: result,
        meta: {
          provider: "mcl",
          movieSetId: String(movieSetId),
          source: result.source,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      const status = Number(error?.httpStatus) === 504 ? 504 : 502;
      return errorResponse(error, "MCL_TICKETING_ERROR", status, {
        category: error?.category || "upstream_error",
        causeCode: error?.causeCode || "MCL_UPSTREAM_ERROR",
        upstreamStatus: finiteNumberOrNull(error?.upstreamStatus),
        elapsedMs: finiteNumberOrNull(error?.elapsedMs)
      });
    }
  }, { errorCode: "MCL_TICKETING_ERROR" }),

  pattern("mcl-seatmap", /^\/api\/mcl\/shows\/([^/]+)\/seats$/, async ({ url, match }) => {
    const sessionId = decodeURIComponent(match[1]);
    const cinemaCode = url.searchParams.get("cinemaCode");
    const summaryOnly = url.searchParams.get("summary") === "1";
    if (!cinemaCode || !/^\d{1,4}$/.test(cinemaCode)) {
      return invalid("INVALID_MCL_CINEMA_CODE", "cinemaCode must be numeric");
    }
    const result = await getMCLSeatMap(cinemaCode, sessionId);
    const data = summaryOnly
      ? {
          provider: "mcl",
          cinemaCode: result.cinemaCode,
          sessionId: result.sessionId,
          counts: result.counts,
          layoutVersion: result.layoutVersion,
          source: {
            provider: result.source?.provider || "mcl",
            parser: result.source?.parser || null,
            updatedAt: result.source?.updatedAt || new Date().toISOString()
          }
        }
      : result;
    return json({
      ok: true,
      data,
      meta: {
        provider: "mcl",
        cinemaCode: String(cinemaCode),
        sessionId: String(sessionId),
        summaryOnly,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "MCL_SEATMAP_ERROR" }),

  exact("emperor-catalogue-current", "/api/emperor/movies", async () => {
    const result = await getEmperorMovies();
    return json({
      ok: true,
      data: result.movies,
      meta: {
        provider: "emperor",
        count: result.movies.length,
        source: result.source,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "EMPEROR_MOVIES_ERROR" }),

  exact("emperor-catalogue-upcoming", "/api/emperor/upcoming", async () => {
    const result = await getEmperorUpcoming();
    return json({
      ok: true,
      data: result.movies,
      meta: {
        provider: "emperor",
        type: "coming-soon",
        count: result.movies.length,
        source: result.source,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "EMPEROR_UPCOMING_ERROR" }),

  pattern("emperor-showtimes", /^\/api\/emperor\/movies\/([^/]+)\/shows$/, async ({ url, match }) => {
    const filmUniqueId = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(filmUniqueId)) {
      return invalid("INVALID_EMPEROR_FILM_ID", "filmUniqueId is invalid");
    }
    const date = validDate(url.searchParams.get("date"));
    if (date.error) return date.error;
    const result = await getEmperorMovieShows(filmUniqueId, date.value);
    return json({
      ok: true,
      data: {
        availableDates: result.availableDates,
        selectedDate: result.selectedDate,
        sessions: result.sessions
      },
      meta: {
        provider: "emperor",
        filmUniqueId,
        source: result.source,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "EMPEROR_SHOWS_ERROR" }),

  pattern("emperor-seatmap", /^\/api\/emperor\/shows\/(\d+)\/seats$/, async ({ url, match }) => {
    const scheduleId = match[1];
    const result = await getEmperorSeatMap({
      scheduleId,
      scheduleKey: url.searchParams.get("scheduleKey") || "",
      cinemaLinkId: url.searchParams.get("cinemaLinkId") || "",
      hallId: url.searchParams.get("hallId") || ""
    });
    return json({
      ok: true,
      data: result,
      meta: {
        phase: "6G",
        provider: "emperor",
        scheduleId,
        geometryVersion: result.geometryVersion || GEOMETRY_VERSION,
        source: result.source,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "EMPEROR_SEATMAP_ERROR" }),

  exact("cineart-discovery", "/api/providers/cineart/discovery", async () => {
    const result = await discoverCineArt();
    return json({
      ok: true,
      data: result,
      meta: {
        phase: "M7P1B",
        mode: "worker-adapter-discovery",
        readOnly: true,
        updatedAt: new Date().toISOString()
      }
    });
  }, { errorCode: "CINEART_DISCOVERY_ERROR" }),

  exact("cineart-catalogue", "/api/cineart/catalogue", async ({ ctx }) => {
    const result = await cineArtCatalogueService.get({ ctx });
    return json({
      ok: true,
      data: result,
      meta: {
        phase: "M7P1C",
        provider: "cineart",
        mode: "catalogue-only",
        cacheState: result?.meta?.cacheState || "network",
        stale: result?.meta?.stale === true,
        updatedAt: result?.meta?.updatedAt || new Date().toISOString()
      }
    });
  }, { errorCode: "CINEART_CATALOGUE_ERROR" }),

  pattern("cineart-showtimes", /^\/api\/cineart\/movies\/(\d+)\/shows$/, async ({ url, match, ctx }) => {
    const movieSourceId = match[1];
    const result = await cineArtShowtimeService.getMovie(
      movieSourceId,
      url.searchParams.get("date"),
      { ctx }
    );
    return json({
      ok: true,
      data: result,
      meta: {
        phase: "M7P1F",
        provider: "cineart",
        mode: "showtimes-detailed-price-strict-seats-selected-date",
        movieSourceId,
        cacheState: result?.meta?.cacheState || "network",
        stale: result?.meta?.stale === true,
        updatedAt: result?.meta?.updatedAt || new Date().toISOString()
      }
    });
  }, { errorCode: "CINEART_SHOWTIMES_ERROR" }),

  pattern("cineart-seatmap", /^\/api\/cineart\/shows\/(\d+)\/seats$/, async ({ url, match, ctx }) => {
    const showId = match[1];
    const result = await cineArtSeatMapService.get(
      showId,
      url.searchParams.get("movieSourceId"),
      { ctx }
    );
    return json({
      ok: true,
      data: result,
      meta: {
        phase: "M7P1G",
        provider: "cineart",
        mode: "read-only-seatmap-official-geometry",
        showId,
        cacheState: result?.meta?.cacheState || "network",
        updatedAt: result?.updatedAt || new Date().toISOString()
      }
    });
  }, { errorCode: "CINEART_SEATMAP_ERROR" })
];

async function emperorProbe() {
  const result = await probeEmperor();
  return json({
    ok: true,
    data: result,
    meta: {
      phase: "6A",
      provider: "emperor",
      updatedAt: new Date().toISOString()
    }
  });
}

function validDate(value) {
  if (value === null || value === undefined || value === "") {
    return { value: null, error: null };
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { value, error: null }
    : { value: null, error: invalid("INVALID_DATE", "date must use YYYY-MM-DD") };
}

export const ROUTES = Object.freeze(routes);

export async function routeRequest(request, env = {}, ctx = null) {
  const url = new URL(request.url);
  for (const route of ROUTES) {
    const match = route.match(url);
    if (!match) continue;
    if (request.method !== "GET") return methodNotAllowed(route);
    try {
      return await route.handler({ request, url, match, env, ctx });
    } catch (error) {
      return errorResponse(error, route.errorCode);
    }
  }
  return invalid("NOT_FOUND", "Endpoint not found", 404);
}
