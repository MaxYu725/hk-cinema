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

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "hk-cinema-api",
        phase: "0D",
        time: new Date().toISOString()
      });
    }

    // MCL
    if (url.pathname === "/probe/mcl") {
      const upstream =
        "https://www.mclcinema.com/MCLWebAPI2/GetCinemaDetails.aspx?l=1";

      try {
        const response = await fetch(upstream, {
          headers: {
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
            Referer: "https://www.mclcinema.com/"
          }
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
            status: response.status,
            server: response.headers.get("server"),
            cfRay: response.headers.get("cf-ray")
          },
          cinemaCount: Array.isArray(parsed) ? parsed.length : null,
          responsePreview:
            Array.isArray(parsed) ? null : text.slice(0, 300),
          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        return json({
          ok: false,
          provider: "mcl",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Broadway
    if (url.pathname === "/probe/broadway") {
      const upstream =
        "https://www.cinema.com.hk/hk/movie/ticketing";

      try {
        const response = await fetch(upstream, {
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36"
          }
        });

        const text = await response.text();

        return json({
          ok: response.ok,
          provider: "broadway",
          upstream: {
            status: response.status,
            contentType: response.headers.get("content-type")
          },
          bytes: text.length,
          detection: {
            hasNextData:
              text.includes("__next") ||
              text.includes("self.__next_f")
          },
          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        return json({
          ok: false,
          provider: "broadway",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Emperor diagnostic
    if (url.pathname === "/probe/emperor") {
      const result = {
        ok: false,
        provider: "emperor",
        site: null,
        api: null,
        checkedAt: new Date().toISOString()
      };

      // Test 1: public website
      try {
        const siteResponse = await fetch(
          "https://www.emperorcinemas.com/film",
          {
            headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language":
                "zh-HK,zh-TW;q=0.9,en;q=0.8",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36"
            },
            redirect: "follow"
          }
        );

        const siteText = await siteResponse.text();

        result.site = {
          ok: siteResponse.ok,
          status: siteResponse.status,
          finalUrl: siteResponse.url,
          bytes: siteText.length,
          contentType:
            siteResponse.headers.get("content-type")
        };
      } catch (error) {
        result.site = {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        };
      }

      // Test 2: unsigned public API request.
      // We EXPECT authentication/signature rejection.
      try {
        const timestamp = Date.now();

        const apiUrl =
          "https://gopgrayesa-api.icirena.ai/sync" +
          "?method=gop.alipic.icirena.own.film.coming" +
          "&app_key=500000" +
          "&sign_method=sha256" +
          `&timestamp=${timestamp}` +
          "&format=json" +
          "&simplify=true";

        const body =
          "empCode=" +
          "&leaseCode=" +
          "&channelCode=ECML_WEB_PROD_S_MPS" +
          "&larkSid=" +
          "&version=" +
          "&appVersion=H5_5.0" +
          "&filmVersionCode=" +
          "&filterPreSale=true" +
          "&__cv__=WEBSITE";

        const apiResponse = await fetch(apiUrl, {
          method: "POST",
          headers: {
            Accept: "*/*",
            "Content-Type":
              "application/x-www-form-urlencoded",
            channelCode: "ECML_WEB_PROD_S_MPS",
            appKey: "500000",
            Origin: "https://www.emperorcinemas.com",
            Referer: "https://www.emperorcinemas.com/"
          },
          body
        });

        const apiText = await apiResponse.text();

        let parsed = null;
        try {
          parsed = JSON.parse(apiText);
        } catch {}

        result.api = {
          reachable: true,
          httpStatus: apiResponse.status,
          contentType:
            apiResponse.headers.get("content-type"),
          json: parsed,
          preview:
            parsed ? null : apiText.slice(0, 500)
        };
      } catch (error) {
        result.api = {
          reachable: false,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        };
      }

      result.ok =
        result.site?.ok === true &&
        result.api?.reachable === true;

      return json(result);
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
