(() => {
  const WORKER_TIMEOUT_MS = 8000;

  function messageOf(error) {
    return error instanceof Error
      ? error.message
      : String(error || "");
  }

  function isFormatMismatch(error) {
    return /場次格式未能識別|grid=|GetNowShowingGrid|MCL 場次格式/i
      .test(messageOf(error));
  }

  async function getWorkerTicketing(
    movieSetId,
    selectedDate = null,
    options = {}
  ) {
    const id = String(movieSetId || "")
      .replace(/^mcl:/, "");

    const params = new URLSearchParams({
      movieSetId: id
    });

    if (selectedDate) {
      params.set("date", selectedDate);
    }

    const result = await window.HKCinemaApiClient?.get?.("/api/mcl/ticketing", {
      query: params,
      signal: options?.signal || null,
      timeoutMs: WORKER_TIMEOUT_MS
    });
    if (!result?.data) throw new Error("MCL Worker response is invalid");
    return result.data;
  }

  function unsupportedVpnError() {
    return new Error(
      "MCL 場次暫不支援 VPN／Proxy 網絡。MCL 在這類網絡下可能回傳異常或不完整資料，請關閉 VPN／Proxy 後重新載入比較。"
    );
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
      selectedDate = null,
      options = {}
    ) => {
      const id = String(movieSetId || "")
        .replace(/^mcl:/, "");
      let browserData = null;

      try {
        browserData = await browserGetTicketing(
          id,
          selectedDate,
          options
        );

        if (browserData?.metadataComplete !== false) {
          return browserData;
        }
      } catch (browserError) {
        if (options?.signal?.aborted) throw browserError;
        // A fast HTTP 200 response containing the wrong MCL payload is the
        // recurring VPN / proxy failure mode. Do not enter a long fallback
        // chain or return stale partial showtimes in this case.
        if (isFormatMismatch(browserError)) {
          throw unsupportedVpnError();
        }
      }

      try {
        const data = await getWorkerTicketing(
          id,
          selectedDate,
          options
        );

        return {
          ...data,
          source: {
            ...(data?.source || {}),
            fallbackFrom:
              "browser-direct-mclwebapi2"
          }
        };
      } catch (workerError) {
        if (options?.signal?.aborted) throw workerError;
        if (Array.isArray(browserData?.sessions) && browserData.sessions.length) {
          return browserData;
        }
        throw new Error(
          "MCL 場次暫時無法更新。請檢查網絡後重試；如正在使用 VPN／Proxy，請關閉後再試。"
        );
      }
    };

    provider.ticketingHybridInstalled = true;
    provider.ticketingTransport =
      "hybrid-webapi2-worker-v4-fast-fail";

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
