import baseWorker from "./index.js";
import {
  getEmperorMovies,
  getEmperorUpcoming,
  getEmperorMovieShows,
  probeEmperor
} from "./providers/emperor.js";

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...extraHeaders
    }
  });

function errorResponse(error, fallbackCode) {
  return json({
    ok: false,
    error: {
      code: error?.code || fallbackCode,
      message: error instanceof Error ? error.message : String(error)
    }
  }, Number.isFinite(error?.status) ? error.status : 502);
}

function validFilmId(value) {
  return /^[A-Za-z0-9_-]{4,80}$/.test(String(value || ""));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      url.pathname === "/api/emperor/health" ||
      url.pathname === "/api/emperor/probe"
    ) {
      try {
        const result = await probeEmperor();
        return json({
          ok: true,
          data: result,
          meta: {
            phase: "6A",
            provider: "emperor",
            updatedAt: new Date().toISOString()
          }
        }, 200, { "cache-control": "no-store" });
      } catch (error) {
        return errorResponse(error, "EMPEROR_PROBE_ERROR");
      }
    }

    if (url.pathname === "/api/emperor/movies") {
      try {
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
        }, 200, { "cache-control": "public, max-age=300" });
      } catch (error) {
        return errorResponse(error, "EMPEROR_MOVIES_ERROR");
      }
    }

    if (url.pathname === "/api/emperor/upcoming") {
      try {
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
        }, 200, { "cache-control": "public, max-age=1800" });
      } catch (error) {
        return errorResponse(error, "EMPEROR_UPCOMING_ERROR");
      }
    }

    const showMatch = url.pathname.match(
      /^\/api\/emperor\/movies\/([^/]+)\/shows$/
    );

    if (showMatch) {
      const filmUniqueId = decodeURIComponent(showMatch[1]);
      const date = url.searchParams.get("date");

      if (!validFilmId(filmUniqueId)) {
        return json({
          ok: false,
          error: {
            code: "INVALID_EMPEROR_FILM_ID",
            message: "filmUniqueId is invalid"
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
        const result = await getEmperorMovieShows(filmUniqueId, date);
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
        }, 200, { "cache-control": "public, max-age=60" });
      } catch (error) {
        return errorResponse(error, "EMPEROR_SHOWS_ERROR");
      }
    }

    return baseWorker.fetch(request, env, ctx);
  }
};
