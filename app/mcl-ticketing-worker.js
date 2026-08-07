(() => {
  const WORKER_API =
    "https://hk-cinema-api.max-yu-jp.workers.dev";

  const CACHE_MAX_AGE_MS =
    2 * 60 * 1000;

  function cacheKey(movieSetId, date) {
    return (
      `hkcinema:mcl-worker-ticketing:${movieSetId}:` +
      `${date || "default"}:v1`
    );
  }

  function readCache(movieSetId, date) {
    try {
      const key = cacheKey(movieSetId, date);
      const text = sessionStorage.getItem(key);

      if (!text) return null;

      const cached = JSON.parse(text);
      const age = Date.now() - Number(cached?.savedAt);

      if (
        !Number.isFinite(age) ||
        age < 0 ||
        age > CACHE_MAX_AGE_MS ||
        !cached?.data
      ) {
        sessionStorage.removeItem(key);
        return null;
      }

      return cached.data;
    } catch {
      return null;
    }
  }

  function writeCache(movieSetId, date, data) {
    try {
      sessionStorage.setItem(
        cacheKey(movieSetId, date),
        JSON.stringify({
          savedAt: Date.now(),
          data
        })
      );
    } catch {
      // Ignore storage failures.
    }
  }

  async function getTicketing(movieSetId, selectedDate = null) {
    const id = String(movieSetId || "")
      .replace(/^mcl:/, "");

    if (!/^\d+$/.test(id)) {
      throw new Error("Invalid MCL movie ID");
    }

    const cached = readCache(id, selectedDate);

    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({
      movieSetId: id
    });

    if (selectedDate) {
      params.set("date", selectedDate);
    }

    const response = await fetch(
      `${WORKER_API}/api/mcl/ticketing?${params.toString()}`,
      {
        cache: "no-store"
      }
    );

    let result = null;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        `MCL Worker returned HTTP ${response.status}`
      );
    }

    if (!response.ok || !result?.ok || !result?.data) {
      throw new Error(
        result?.error?.message ||
        `MCL Worker HTTP ${response.status}`
      );
    }

    writeCache(id, selectedDate, result.data);
    return result.data;
  }

  function install() {
    const provider =
      window.HKCinemaProviders?.mcl;

    if (!provider) {
      return false;
    }

    provider.getTicketing = getTicketing;
    provider.ticketingTransport = "cloudflare-worker";
    provider.ticketingApiBase = WORKER_API;

    return true;
  }

  if (!install()) {
    window.addEventListener(
      "DOMContentLoaded",
      install,
      { once: true }
    );
  }
})();
