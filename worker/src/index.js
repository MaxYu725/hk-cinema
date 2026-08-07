import {
  getBroadwayMovies
} from "./providers/broadway.js";

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

        "access-control-allow-origin":
          "*",

        ...extraHeaders
      }
    }
  );

export default {
  async fetch(request) {
    const url =
      new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "hk-cinema-api",
        phase: "2A",
        time:
          new Date().toISOString()
      });
    }

    if (
      url.pathname ===
      "/api/broadway/movies"
    ) {
      try {
        const result =
          await getBroadwayMovies();

        return json(
          {
            ok: true,

            data:
              result.movies,

            meta: {
              provider:
                "broadway",

              count:
                result.movies.length,

              source:
                result.source,

              updatedAt:
                new Date().toISOString()
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
              code:
                "BROADWAY_PARSE_ERROR",

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
          message:
            "Endpoint not found"
        }
      },
      404
    );
  }
};
