(() => {
  const WORKER_API =
    "https://hk-cinema-api.max-yu-jp.workers.dev";
  const STALE_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

  function cacheKey(movieSetId, selectedDate) {
    return `hkcinema:mcl-ticketing:last-good:${movieSetId}:${selectedDate || "default"}:v1`;
  }

  function writeLastGood(movieSetId, selectedDate, data) {
    try {
      localStorage.setItem(
        cacheKey(movieSetId, selectedDate),
        JSON.stringify({ savedAt: Date.now(), data })
      );
    } catch {
      // Storage is optional.
    }
  }

  function readLastGood(movieSetId, selectedDate) {
    try {
      const raw = localStorage.getItem(
        cacheKey(movieSetId, selectedDate)
      );
      if (!raw) return null;

      const cached = JSON.parse(raw);
      const age = Date.now() - Number(cached?.savedAt);
      if (
        !cached?.data ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > STALE_CACHE_MAX_AGE_MS
      ) {
        localStorage.removeItem(cacheKey(movieSetId, selectedDate));
        return null;
      }

      return cached.data;
    } catch {
      return null;
    }
  }

  async function getWorkerTicketing(
    movieSetId,
    selectedDate = null
  ) {
    const id = String(movieSetId || "")
      .replace(/^mcl:/, "");

    const params = new URLSearchParams({
      movieSetId: id
    });

    if (selectedDate) {
      params.set("date", selectedDate);
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      18000
    );

    try {
      const response = await fetch(
        `${WORKER_API}/api/mcl/ticketing?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        }
      );

      let result = null;

      try {
        result = await response.json();
      } catch {
        throw new Error(
          `Worker HTTP ${response.status}`
        );
      }

      if (
        !response.ok ||
        !result?.ok ||
        !result?.data
      ) {
        throw new Error(
          `Worker HTTP ${response.status}`
        );
      }

      return result.data;
    } finally {
      clearTimeout(timer);
    }
  }

  function install() {
    const provider =
      window.HKCinemaProviders?.mcl;

    if (!provider?.getTicketing) {
      return false;
    }

    if (provider.ticketingHybridInstalled) {
      return true;
    }

    const browserGetTicketing =
      provider.getTicketing.bind(provider);

    provider.getTicketing = async (
      movieSetId,
      selectedDate = null
    ) => {
      const id = String(movieSetId || "")
        .replace(/^mcl:/, "");
      let browserError = null;

      try {
        const data = await browserGetTicketing(
          id,
          selectedDate
        );
        writeLastGood(id, selectedDate, data);
        return data;
      } catch (error) {
        browserError = error;
      }

      try {
        const data = await getWorkerTicketing(
          id,
          selectedDate
        );

        const result = {
          ...data,
          source: {
            ...(data?.source || {}),
            fallbackFrom:
              "browser-direct-mclwebapi2"
          }
        };

        writeLastGood(id, selectedDate, result);
        return result;
      } catch {
        const cached = readLastGood(id, selectedDate);
        if (cached) {
          return {
            ...cached,
            source: {
              ...(cached?.source || {}),
              staleFallback: true,
              staleReason: "network-or-vpn"
            }
          };
        }

        const browserMessage = browserError instanceof Error
          ? browserError.message
          : String(browserError || "");
        const looksLikeVpnMismatch =
          /場次格式未能識別|grid=|timeout|abort|failed to fetch|network/i
            .test(browserMessage);

        throw new Error(
          looksLikeVpnMismatch
            ? "MCL 場次在目前網絡下暫時無法更新。VPN／Proxy 可能會令 MCL 回傳異常資料，請暫時關閉 VPN 後重試。"
            : "MCL 場次暫時無法更新，請稍後重試；如正在使用 VPN／Proxy，請先關閉後再試。"
        );
      }
    };

    provider.ticketingHybridInstalled = true;
    provider.ticketingTransport =
      "hybrid-webapi2-worker-v3";

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
