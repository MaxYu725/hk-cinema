(() => {
  let refreshInFlight = false;

  function summary(catalogue) {
    const now = Array.isArray(catalogue?.now) ? catalogue.now.length : 0;
    const coming = Array.isArray(catalogue?.coming) ? catalogue.coming.length : 0;
    return `現正上映 ${now} 部 · 即將上映 ${coming} 部`;
  }

  function updatedAt(catalogue) {
    return catalogue?.meta?.updatedAt || catalogue?.meta?.cacheSavedAt || null;
  }

  function publishCatalogue(catalogue) {
    const provider = window.HKCinemaProviders?.cineart;
    if (provider) provider.catalogue = catalogue;
    window.HKCinemaProviderSharedCore?.publishCatalogue?.("cineart", catalogue, {
      publisher: "cineart-status",
      phase: "M7P1C"
    });
  }

  function report(status, source, catalogue, detail) {
    window.HKCinemaDataHealth?.report?.("cineart", {
      status,
      source,
      updatedAt: updatedAt(catalogue),
      detail
    });
  }

  async function loadCineArtCatalogue() {
    if (refreshInFlight) return;
    refreshInFlight = true;

    const provider = window.HKCinemaProviders?.cineart;
    if (!provider) {
      report("error", "network", null, "CineArt provider 未能載入");
      refreshInFlight = false;
      return;
    }

    const cached = provider.getCachedCatalogue?.() || provider.catalogue || null;
    if (cached) {
      publishCatalogue(cached);
      report("loading", "cache", cached, `${summary(cached)} · 顯示備用資料並更新中`);
    } else {
      report("loading", "network", null, "正在經 Worker 取得 CineArt 電影目錄");
    }

    try {
      const catalogue = await provider.refreshCatalogue();
      publishCatalogue(catalogue);

      if (catalogue.meta?.stale === true) {
        report(
          "degraded",
          "cache",
          catalogue,
          `${summary(catalogue)} · 上游暫時不可用，使用短期備用資料`
        );
      } else {
        report("fresh", catalogue.meta?.cache ? "cache" : "network", catalogue, summary(catalogue));
      }
    } catch (error) {
      if (cached) {
        report("degraded", "cache", cached, `${summary(cached)} · 暫時未能更新`);
      } else {
        const message = error?.name === "AbortError"
          ? "CineArt 連線逾時；其他院線功能不受影響。"
          : `CineArt 讀取失敗：${error instanceof Error ? error.message : String(error)}`;
        report("error", "network", null, message);
      }
    } finally {
      refreshInFlight = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadCineArtCatalogue, { once: true });
  } else {
    loadCineArtCatalogue();
  }

  document.querySelector("#refreshButton")?.addEventListener("click", loadCineArtCatalogue);
})();
