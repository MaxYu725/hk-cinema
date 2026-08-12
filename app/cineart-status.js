(() => {
  let refreshInFlight = false;

  function publishCatalogue(catalogue) {
    const provider = window.HKCinemaProviders?.cineart;
    if (provider) provider.catalogue = catalogue;
    window.HKCinemaCineArtCatalogue = catalogue;
    window.dispatchEvent(new CustomEvent("hkcinema:cineart-catalogue", {
      detail: catalogue
    }));
    window.dispatchEvent(new CustomEvent("hkcinema:provider-catalogue", {
      detail: { provider: "cineart", catalogue }
    }));
  }

  function summary(catalogue) {
    return `現正上映 ${catalogue?.now?.length || 0} 部 · 即將上映 ${catalogue?.coming?.length || 0} 部`;
  }

  function updatedAt(catalogue) {
    return catalogue?.meta?.updatedAt || catalogue?.meta?.cacheSavedAt || null;
  }

  function report(status, source, catalogue, detail) {
    window.HKCinemaDataHealth?.report?.("cineart", {
      status,
      source,
      updatedAt: updatedAt(catalogue),
      detail
    });
  }

  async function loadCineArtStatus() {
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
      report("loading", "network", null, "首次載入中");
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
        report("fresh", "network", catalogue, summary(catalogue));
      }
    } catch (error) {
      if (cached) {
        report(
          "degraded",
          "cache",
          cached,
          `${summary(cached)} · 暫時未能更新`
        );
      } else {
        const message = error?.name === "AbortError"
          ? "CineArt 連線逾時"
          : `CineArt 讀取失敗：${error instanceof Error ? error.message : String(error)}`;
        report("error", "network", null, message);
      }
    } finally {
      refreshInFlight = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadCineArtStatus, { once: true });
  } else {
    loadCineArtStatus();
  }

  document.querySelector("#refreshButton")?.addEventListener("click", loadCineArtStatus);
})();
