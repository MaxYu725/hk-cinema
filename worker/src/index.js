if (url.pathname === "/probe/broadway") {
  const upstream =
    "https://www.cinema.com.hk/hk/movie/ticketing";

  try {
    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        "Accept":
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
          text.includes("movie"),
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
