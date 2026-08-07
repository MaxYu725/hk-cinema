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

const json = (
  data,
  status = 200,
  extraHeaders = {}
) =>
  new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        ...extraHeaders
      }
    }
  );

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "hk-cinema-api",
        phase: "3B",
        time: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/broadway/movies") {
      try {
        const result = await getBroadwayMovies();

        return json(
          {
            ok: true,
            data: result.movies,
            meta: {
              provider: "broadway",
              count: result.movies.length,
              source: result.source,
              updatedAt: new Date().toISOString()
            }
          },
          200,
          {
            "cache-control":
              "public, max-age=300"
          }
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: {
              code: "BROADWAY_PARSE_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : String(error)
            }
          },
          502
        );
      }
    }

    if (url.pathname === "/api/broadway/upcoming") {
      try {
        const result = await getBroadwayUpcoming();

        return json(
          {
            ok: true,
            data: result.movies,
            meta: {
              provider: "broadway",
              type: "coming-soon",
              count: result.movies.length,
              source: result.source,
              updatedAt: new Date().toISOString()
            }
          },
          200,
          {
            "cache-control":
              "public, max-age=1800"
          }
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: {
              code: "BROADWAY_UPCOMING_PARSE_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : String(error)
            }
          },
          502
        );
      }
    }

    const showMatch = url.pathname.match(
      /^\/api\/broadway\/movies\/([^/]+)\/shows$/
    );

    if (showMatch) {
      const movieId =
        decodeURIComponent(showMatch[1]);

      const date =
        url.searchParams.get("date");

      if (
        date &&
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        return json(
          {
            ok: false,
            error: {
              code: "INVALID_DATE",
              message:
                "date must use YYYY-MM-DD"
            }
          },
          400
        );
      }

      try {
        const result =
          await getBroadwayMovieShows(
            movieId,
            date
          );

        if (!result) {
          return json(
            {
              ok: false,
              error: {
                code: "MOVIE_NOT_FOUND",
                message:
                  "Broadway movie not found"
              }
            },
            404
          );
        }

        return json(
          {
            ok: true,
            data: {
              movie: result.movie,
              availableDates:
                result.availableDates,
              selectedDate:
                result.selectedDate,
              sessions:
                result.sessions
            },
            meta: {
              provider: "broadway",
              source: result.source,
              updatedAt:
                new Date().toISOString()
            }
          },
          200,
          {
            "cache-control":
              "public, max-age=60"
          }
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: {
              code:
                "BROADWAY_SHOWS_PARSE_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : String(error)
            }
          },
          502
        );
      }
    }

    const seatMatch = url.pathname.match(
      /^\/api\/broadway\/shows\/([^/]+)\/seats$/
    );

    if (seatMatch) {
      const showId =
        decodeURIComponent(seatMatch[1]);

      try {
        const result =
          await getBroadwaySeatMap(showId);

        return json(
          {
            ok: true,
            data: result,
            meta: {
              provider: "broadway",
              showId: result.showId,
              updatedAt:
                result.updatedAt
            }
          },
          200,
          {
            "cache-control":
              "public, max-age=30"
          }
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: {
              code:
                "BROADWAY_SEATMAP_PARSE_ERROR",
              message:
                error instanceof Error
                  ? error.message
                  : String(error)
            }
          },
          502
        );
      }
    }

    return json(
      {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found"
        }
      },
      404
    );
  }
};
