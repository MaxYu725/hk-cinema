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

    // Phase 0D-2: MCL connectivity probe
    if (url.pathname === "/probe/mcl") {
      const upstream =
        "https://www.mclcinema.com/MCLWebAPI2/GetCinemaDetails.aspx?l=1";

      try {
        const response = await fetch(upstream, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; HKCinemaAggregator/0.1)"
          }
        });

        const text = await response.text();

        if (!response.ok) {
          return json(
            {
              ok: false,
              provider: "mcl",
              upstreamStatus: response.status,
              error: "MCL upstream returned an error",
              preview: text.slice(0, 500)
            },
            502
          );
        }

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          return json(
            {
              ok: false,
              provider: "mcl",
              upstreamStatus: response.status,
              error: "MCL response was not valid JSON",
              preview: text.slice(0, 500)
            },
            502
          );
        }

        return json({
          ok: true,
          provider: "mcl",
          upstreamStatus: response.status,
          cinemaCount: Array.isArray(data) ? data.length : null,
          sample: Array.isArray(data) ? data.slice(0, 3) : data,
          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        return json(
          {
            ok: false,
            provider: "mcl",
            error: error instanceof Error ? error.message : String(error)
          },
          502
        );
      }
    }

    return json(
      {
        ok: false,
        error: "Not Found"
      },
      404
    );
  }
};
