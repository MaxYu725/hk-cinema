(() => {
  let refreshInFlight = false;

  function setCardState(card, status, title, text) {
    card.dataset.status = status;
    const strong = card.querySelector("strong");
    const paragraph = card.querySelector("p");
    if (strong) strong.textContent = title;
    if (paragraph) paragraph.textContent = text;
  }

  function ensureCard() {
    let card = document.querySelector("#mclStatus");
    if (card) return card;

    const broadwayStatus = document.querySelector("#systemStatus");
    card = document.createElement("section");
    card.id = "mclStatus";
    card.className = "status-card";
    card.dataset.status = "loading";
    card.innerHTML = `
      <div class="status-dot"></div>
      <div>
        <strong>MCL 連接中</strong>
        <p>正在由瀏覽器直接取得 MCL 電影資料。</p>
      </div>
    `;
    if (broadwayStatus) broadwayStatus.insertAdjacentElement("afterend", card);
    return card;
  }

  function publishCatalogue(catalogue) {
    window.HKCinemaProviderSharedCore?.publishCatalogue?.("mcl", catalogue, {
      publisher: "mcl-status"
    });
  }

  function catalogueSummary(catalogue) {
    return `現正上映 ${catalogue.now.length} 部 · 即將上映 ${catalogue.coming.length} 部 · 特別節目 ${catalogue.festival.length} 部`;
  }

  function catalogueUpdatedAt(catalogue) {
    return catalogue?.meta?.updatedAt || catalogue?.meta?.cacheSavedAt || null;
  }

  function reportHealth(status, source, catalogue, detail) {
    window.HKCinemaDataHealth?.report?.("mcl", {
      status,
      source,
      updatedAt: catalogueUpdatedAt(catalogue),
      detail
    });
  }

  function updatedText(catalogue) {
    const value = catalogueUpdatedAt(catalogue);
    return value
      ? `${window.HKCinemaDataHealth?.formatAge?.(value) || "最近"}更新`
      : "尚未更新";
  }

  function formatCacheAge(ageMs) {
    if (!Number.isFinite(ageMs) || ageMs < 0) return "上次成功資料";
    const minutes = Math.floor(ageMs / 60000);
    if (minutes < 1) return "剛才的資料";
    if (minutes < 60) return `${minutes} 分鐘前資料`;
    return `${Math.floor(minutes / 60)} 小時前資料`;
  }

  async function loadMCLStatus() {
    if (refreshInFlight) return;
    refreshInFlight = true;

    const card = ensureCard();
    const provider = window.HKCinemaProviders?.mcl;

    if (!provider) {
      refreshInFlight = false;
      setCardState(card, "error", "MCL 未連接", "MCL provider 未能載入。");
      reportHealth("error", "network", null, "Provider 未能載入");
      return;
    }

    const cached = provider.getCachedCatalogue?.() || null;
    if (cached) {
      publishCatalogue(cached);
      setCardState(
        card,
        "loading",
        "MCL 已載入 · 更新中",
        `${catalogueSummary(cached)} · ${formatCacheAge(cached.meta?.cacheAgeMs)}`
      );
      reportHealth("loading", "cache", cached, "顯示備用資料並更新中");
    } else {
      setCardState(
        card,
        "loading",
        "MCL 連接中",
        "正在取得 MCL 最新電影資料；失敗時會自動重試一次。"
      );
      reportHealth("loading", "network", null, "首次載入中");
    }

    try {
      const catalogue = await provider.refreshCatalogue();
      publishCatalogue(catalogue);
      setCardState(
        card,
        "ready",
        "MCL 已連接",
        `${catalogueSummary(catalogue)} · ${updatedText(catalogue)}`
      );
      reportHealth("fresh", "network", catalogue, catalogueSummary(catalogue));
    } catch (error) {
      if (cached) {
        const reason = error?.name === "AbortError" ? "MCL 更新逾時" : "MCL 暫時未能更新";
        setCardState(
          card,
          "loading",
          "MCL 使用快取資料",
          `${catalogueSummary(cached)} · ${reason}，稍後可再更新`
        );
        reportHealth("degraded", "cache", cached, `${catalogueSummary(cached)} · ${reason}`);
      } else {
        const message = error?.name === "AbortError"
          ? "MCL 兩次連線均逾時；其他院線功能不受影響。"
          : `瀏覽器直連失敗：${error instanceof Error ? error.message : String(error)}`;
        setCardState(card, "error", "MCL 暫時無法連接", message);
        reportHealth("error", "network", null, message);
      }
    } finally {
      refreshInFlight = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadMCLStatus, { once: true });
  } else {
    loadMCLStatus();
  }

  document.querySelector("#refreshButton")?.addEventListener("click", loadMCLStatus);
})();
