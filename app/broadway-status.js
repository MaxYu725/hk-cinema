(() => {
  let refreshInFlight = false;

  function card() {
    return document.querySelector("#systemStatus");
  }

  function setCardState(status, title, text) {
    const target = card();
    if (!target) return;
    target.dataset.status = status;
    target.querySelector("strong")?.replaceChildren(title);
    target.querySelector("p")?.replaceChildren(text);
  }

  function publish(catalogue) {
    window.HKCinemaProviderSharedCore?.publishCatalogue?.("broadway", catalogue, {
      publisher: "broadway-status"
    });
  }

  function counts(catalogue) {
    const now = (catalogue?.now || []).filter(movie => movie?.status !== "presale").length;
    const presale = (catalogue?.presale || []).length;
    const coming = (catalogue?.coming || []).length;
    return `現正上映 ${now} 部 · 預售 ${presale} 部 · 即將上映 ${coming} 部`;
  }

  function updatedAt(catalogue) {
    return catalogue?.meta?.updatedAt || catalogue?.meta?.cacheSavedAt || null;
  }

  function ageText(catalogue) {
    const value = updatedAt(catalogue);
    return value ? `${window.HKCinemaDataHealth?.formatAge?.(value) || "最近"}更新` : "尚未更新";
  }

  function report(status, source, catalogue, detail) {
    window.HKCinemaDataHealth?.report?.("broadway", {
      status,
      source,
      updatedAt: updatedAt(catalogue),
      detail
    });
  }

  async function loadBroadwayCatalogue() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    const provider = window.HKCinemaProviders?.broadway;
    if (!provider) {
      setCardState("error", "Broadway 未連接", "Broadway provider 未能載入。");
      report("error", "network", null, "Provider 未能載入");
      refreshInFlight = false;
      return;
    }

    const cached = provider.getCachedCatalogue?.() || null;
    if (cached) {
      publish(cached);
      setCardState("loading", "Broadway 已載入 · 更新中", `${counts(cached)} · ${ageText(cached)}`);
      report("loading", "cache", cached, "顯示備用資料並更新中");
    } else {
      setCardState("loading", "Broadway 連接中", "正在經 Worker 取得最新上映及即將上映資料。");
      report("loading", "network", null, "首次載入中");
    }

    try {
      const catalogue = await provider.refreshCatalogue();
      publish(catalogue);
      if (catalogue.meta?.partial) {
        setCardState("loading", "Broadway 部分資料已連接", `${counts(catalogue)} · ${ageText(catalogue)}`);
        report("degraded", catalogue.meta?.cache ? "cache" : "network", catalogue, `${counts(catalogue)} · 部分資料未能更新`);
      } else {
        setCardState("ready", "Broadway 已連接", `${counts(catalogue)} · ${ageText(catalogue)}`);
        report("fresh", "network", catalogue, counts(catalogue));
      }
    } catch (error) {
      if (cached) {
        setCardState("loading", "Broadway 使用快取資料", `${counts(cached)} · 暫時未能更新`);
        report("degraded", "cache", cached, `${counts(cached)} · 暫時未能更新`);
      } else {
        const message = `Worker 讀取失敗：${error instanceof Error ? error.message : String(error)}`;
        setCardState("error", "Broadway 暫時無法連接", `${message}；其他院線不受影響。`);
        report("error", "network", null, message);
      }
    } finally {
      refreshInFlight = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadBroadwayCatalogue, { once: true });
  } else {
    loadBroadwayCatalogue();
  }
  document.querySelector("#refreshButton")?.addEventListener("click", loadBroadwayCatalogue);
})();
