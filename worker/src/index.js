import {
  getBroadwayMovies,
  getBroadwayUpcoming
} from "./providers/broadway.js";

import {
  getBroadwayMovieShows
} from "./providers/broadway-shows.js";

import {
  getBroadwaySeatMap
} from "./providers/broadway-seats.js";

import {
  getMCLTicketing
} from "./providers/mcl-ticketing.js";

import {
  getMCLSeatMap
} from "./providers/mcl-seats.js";

import {
  providerHealthMap
} from "./provider-manifest.js";

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...extraHeaders
    }
  });

const finiteNumberOrNull = value => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "hk-cinema-api",
        phase: "6G",
        status: "operational",
        providers: providerHealthMap(),
        freshness: {
          catalogueFallbackMaxAgeSeconds: 86400,
          comparisonFreshSeconds: 900,
          comparisonStaleSeconds: 7200
        },
        time: new Date().toISOString()
      }, 200, { "cache-control": "no-store" });
    }

    if (url.pathname === "/api/broadway/movies") {
      try {
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
        }, 200, { "cache-control": "public, max-age=300" });
      } catch (error) {
        return json({
          ok: false,
          error: {
            code: "BROADWAY_PARSE_ERROR",
            message: error instanceof Error ? error.message : String(error)
          }
        }, 502);
      }
    }

    if (url.pathname === "/api/broadway/upcoming") {
      try {
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
        }, 200, { "cache-control": "public, max-age=1800" });
      } catch (error) {
        return json({
          ok: false,
          error: {
            code: "BROADWAY_UPCOMING_PARSE_ERROR",
            message: error instanceof Error ? error.message : String(error)
          }
        }, 502);
      }
    }

    const showMatch = url.pathname.match(
      /^\/api\/broadway\/movies\/([^/]+)\/shows$/
    );

    if (showMatch) {
      const movieId = decodeURIComponent(showMatch[1]);
      const date = url.searchParams.get("date");

      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({
          ok: false,
          error: {
            code: "INVALID_DATE",
            message: "date must use YYYY-MM-DD"
          }
        }, 400);
      }

      try {
        const result = await getBroadwayMovieShows(movieId, date);

        if (!result) {
          return json({
            ok: false,
            error: {
              code: "MOVIE_NOT_FOUND",
              message: "Broadway movie not found"
            }
          }, 404);
        }

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
        }, 200, { "cache-control": "public, max-age=60" });
      } catch (error) {
        return json({
          ok: false,
          error: {
            code: "BROADWAY_SHOWS_PARSE_ERROR",
            message: error instanceof Error ? error.message : String(error)
          }
        }, 502);
      }
    }

    const seatMatch = url.pathname.match(
      /^\/api\/broadway\/shows\/([^/]+)\/seats$/
    );

    if (seatMatch) {
      const showId = decodeURIComponent(seatMatch[1]);

      try {
        const result = await getBroadwaySeatMap(showId);
        return json({
          ok: true,
          data: result,
          meta: {
            provider: "broadway",
            showId: result.showId,
            updatedAt: result.updatedAt
          }
        }, 200, { "cache-control": "public, max-age=30" });
      } catch (error) {
        return json({
          ok: false,
          error: {
            code: "BROADWAY_SEATMAP_PARSE_ERROR",
            message: error instanceof Error ? error.message : String(error)
          }
        }, 502);
      }
    }

    const mclSeatMatch = url.pathname.match(
      /^\/api\/mcl\/shows\/([^/]+)\/seats$/
    );

    if (mclSeatMatch) {
      const sessionId = decodeURIComponent(mclSeatMatch[1]);
      const cinemaCode = url.searchParams.get("cinemaCode");
      const summaryOnly = url.searchParams.get("summary") === "1";

      if (!cinemaCode || !/^\d{1,4}$/.test(cinemaCode)) {
        return json({
          ok: false,
          error: {
            code: "INVALID_MCL_CINEMA_CODE",
            message: "cinemaCode must be numeric"
          }
        }, 400);
      }

      try {
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
        }, 200, { "cache-control": "public, max-age=30" });
      } catch (error) {
        return json({
          ok: false,
          error: {
            code: "MCL_SEATMAP_ERROR",
            message: error instanceof Error ? error.message : String(error)
          }
        }, 502);
      }
    }

    if (url.pathname === "/api/mcl/ticketing") {
      const movieSetId = url.searchParams.get("movieSetId");
      const date = url.searchParams.get("date");

      if (!movieSetId || !/^\d+$/.test(movieSetId)) {
        return json({
          ok: false,
          error: {
            code: "INVALID_MCL_MOVIE_ID",
            message: "movieSetId must be numeric"
          }
        }, 400);
      }

      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({
          ok: false,
          error: {
            code: "INVALID_DATE",
            message: "date must use YYYY-MM-DD"
          }
        }, 400);
      }

      try {
        const result = await getMCLTicketing(movieSetId, date);
        return json({
          ok: true,
          data: result,
          meta: {
            provider: "mcl",
            movieSetId: String(movieSetId),
            source: result.source,
            updatedAt: new Date().toISOString()
          }
        }, 200, {
          "cache-control": result.metadataComplete
            ? "public, max-age=60"
            : "no-store"
        });
      } catch (error) {
        const httpStatus = Number(error?.httpStatus) === 504 ? 504 : 502;
        const upstreamStatus = finiteNumberOrNull(error?.upstreamStatus);
        const elapsedMs = finiteNumberOrNull(error?.elapsedMs);

        return json({
          ok: false,
          error: {
            code: "MCL_TICKETING_ERROR",
            category: error?.category || "upstream_error",
            causeCode: error?.causeCode || "MCL_UPSTREAM_ERROR",
            message: error instanceof Error ? error.message : String(error),
            upstreamStatus,
            elapsedMs
          }
        }, httpStatus, { "cache-control": "no-store" });
      }
    }

    return json({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found"
      }
    }, 404);
  }
};