const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    }
  });

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "hk-cinema-api",
        phase: "0D",
        time: new Date().toISOString()
      });
    }

    // MCL probe
    if (url.pathname === "/probe/mcl") {
      const upstream =
        "https://www.mclcinema.com/MCLWebAPI2/GetCinemaDetails.aspx?l=1";

      try {
        const response = await fetch(upstream, {
          method: "GET",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
            Referer: "https://www.mclcinema.com/"
          },
          redirect: "follow"
        });

        const text = await response.text();

        let parsed = null;

        try {
          parsed = JSON.parse(text);
        } catch {}

        return json({
          ok: response.ok && Array.isArray(parsed),
          provider: "mcl",

          upstream: {
            url: response.url,
            status: response.status,
            statusText: response.statusText,
            server: response.headers.get("server"),
            cfRay: response.headers.get("cf-ray"),
            contentType: response.headers.get("content-type")
          },

          cinemaCount: Array.isArray(parsed) ? parsed.length : null,

          sample:
            Array.isArray(parsed)
              ? parsed.slice(0, 2)
              : null,

          responsePreview:
            Array.isArray(parsed)
              ? null
              : text.slice(0, 300),

          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        return json(
          {
            ok: false,
            provider: "mcl",
            fetchException: true,
            error:
              error instanceof Error
                ? error.message
                : String(error),
            checkedAt: new Date().toISOString()
          },
          502
        );
      }
    }

    // Broadway probe
    if (url.pathname === "/probe/broadway") {
      const upstream =
        "https://www.cinema.com.hk/hk/movie/ticketing";

      try {
        const response = await fetch(upstream, {
          method: "GET",
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "zh-HK,zh-TW;q=0.9,en;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36"
          },
          redirect: "follow"
        });

        const text = await response.text();

        return json({
          ok: response.ok,
          provider: "broadway",

          upstream: {
            url: response.url,
            status: response.status,
            statusText: response.statusText,
            server: response.headers.get("server"),
            contentType: response.headers.get("content-type")
          },

          bytes: text.length,

          detection: {
            hasNextData:
              text.includes("__next") ||
              text.includes("self.__next_f"),

            hasMovieText:
              text.toLowerCase().includes("movie"),

            hasTicketingText:
              text.toLowerCase().includes("ticket")
          },

          preview: text.slice(0, 500),

          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        return json(
          {
            ok: false,
            provider: "broadway",
            fetchException: true,
            error:
              error instanceof Error
                ? error.message
                : String(error),
            checkedAt: new Date().toISOString()
          },
          502
        );
      }
    }

    // 404
    return json(
      {
        ok: false,
        error: "Not Found"
      },
      404
    );
  }
};
