(() => {
  const WORKER_API =
    "https://hk-cinema-api.max-yu-jp.workers.dev";

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
      22000
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
          result?.error?.message ||
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
      let browserError = null;

      try {
        return await browserGetTicketing(
          movieSetId,
          selectedDate
        );
      } catch (error) {
        browserError = error;
      }

      try {
        const data = await getWorkerTicketing(
          movieSetId,
          selectedDate
        );

        return {
          ...data,
          source: {
            ...(data?.source || {}),
            fallbackFrom:
              "browser-direct-mclwebapi2",
            browserError:
              browserError instanceof Error
                ? browserError.message
                : String(browserError || "")
          }
        };
      } catch (workerError) {
        const browserMessage =
          browserError instanceof Error
            ? browserError.message
            : String(browserError || "unknown");

        const workerMessage =
          workerError instanceof Error
            ? workerError.message
            : String(workerError || "unknown");

        throw new Error(
          `MCL browser-direct 失敗：${browserMessage}；` +
          `Worker fallback 失敗：${workerMessage}`
        );
      }
    };

    provider.ticketingHybridInstalled = true;
    provider.ticketingTransport =
      "hybrid-webapi2-worker-v2";

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
