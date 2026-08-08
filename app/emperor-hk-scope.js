(() => {
  const previousFetch = window.fetch.bind(window);
  const WORKER_ORIGIN = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const EMPEROR_SHOWS_PATH = /^\/api\/emperor\/movies\/[^/]+\/shows$/;

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function isMacau(value) {
    const text = normalize(value);
    return (
      text.includes("澳門") ||
      text.includes("澳门") ||
      text.includes("macao") ||
      text.includes("macau")
    );
  }

  function isHongKong(value) {
    const text = normalize(value);
    return (
      text.includes("香港") ||
      text === "hong kong" ||
      text.includes("hong kong")
    );
  }

  function isHongKongEmperorSession(session) {
    const cinema = session?.cinema || {};
    const city = cinema.cityName || cinema.cityCode || "";
    const name = cinema?.name?.zh || cinema?.name?.en || "";

    if (isMacau(city) || isMacau(name)) return false;
    if (isHongKong(city)) return true;

    const registry = window.HKCinemaCinemaRegistry;
    const resolved = registry?.resolve?.("emperor", name);
    if (resolved && resolved.region && resolved.region !== "unknown") {
      return true;
    }

    // HK Cinema is intentionally Hong Kong-only. If Emperor does not expose
    // a trustworthy city and the cinema is not in our HK registry, exclude it
    // instead of allowing Macau/unknown venues to affect comparisons.
    return false;
  }

  function requestUrl(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || "");
      return new URL(raw, window.location.href);
    } catch {
      return null;
    }
  }

  function isEmperorShowsRequest(input, init = {}) {
    const method = String(
      init.method || (input instanceof Request ? input.method : "GET") || "GET"
    ).toUpperCase();
    const url = requestUrl(input);

    return Boolean(
      method === "GET" &&
      url?.origin === WORKER_ORIGIN &&
      EMPEROR_SHOWS_PATH.test(url.pathname)
    );
  }

  function filteredResponse(response, payload) {
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.delete("content-length");

    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  window.fetch = async function hkScopedFetch(input, init = {}) {
    const response = await previousFetch(input, init);
    if (!isEmperorShowsRequest(input, init) || !response.ok) {
      return response;
    }

    let payload = null;
    try {
      payload = await response.clone().json();
    } catch {
      return response;
    }

    const sessions = payload?.data?.sessions;
    if (!Array.isArray(sessions)) return response;

    const hkSessions = sessions.filter(isHongKongEmperorSession);
    const excluded = sessions.length - hkSessions.length;

    payload.data.sessions = hkSessions;
    payload.meta = {
      ...(payload.meta || {}),
      regionScope: "HK",
      emperorExcludedNonHongKongSessions: excluded
    };

    return filteredResponse(response, payload);
  };

  window.HKCinemaEmperorHKScope = Object.freeze({
    isHongKongSession: isHongKongEmperorSession
  });
})();