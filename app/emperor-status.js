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
    let card = document.querySelector("#emperorStatus");
    if (card) return card;

    card = document.createElement("section");
    card.id = "emperorStatus";
    card.className = "status-card";
    card.dataset.status = "loading";
    card.innerHTML = `
      <div class="status-dot"></div>
      <div>
        <strong>Emperor 連接中</strong>
        <p>正在經 Worker 取得英皇戲院電影資料。</p>
      </div>
    `;

    const mcl = document.querySelector("#mclStatus");
    const broadway = document.querySelector("#systemStatus");
    (mcl || broadway)?.insertAdjacentElement("afterend", card);
    return card;
  }

  function publishCatalogue(catalogue) {
    window.HKCinemaEmperorCatalogue = catalogue;
    window.dispatchEvent(new CustomEvent("hkcinema:emperor-catalogue", {
      detail: catalogue
    }));
  }

  function summary(catalogue) {
    return `現正上映 ${catalogue.now.length} 部 · 即將上映 ${catalogue.coming.length} 部`;
  }

  function formatCacheAge(ageMs) {
    if (!Number.isFinite(ageMs) || ageMs < 0) return "上次成功資料";
    const minutes = Math.floor(ageMs / 60000);
    if (minutes < 1) return "剛才的資料";
    if (minutes < 60) return `${minutes} 分鐘前資料`;
    return `${Math.floor(minutes / 60)} 小時前資料`;
  }

  async function loadEmperorStatus() {
    if (refreshInFlight) return;
    refreshInFlight = true;

    const card = ensureCard();
    const provider = window.HKCinemaProviders?.emperor;

    if (!provider) {
      refreshInFlight = false;
      setCardState(card, "error", "Emperor 未連接", "Emperor provider 未能載入。");
      return;
    }

    const cached = provider.getCachedCatalogue?.() || null;

    if (cached) {
      publishCatalogue(cached);
      setCardState(
        card,
        "loading",
        "Emperor 已載入 · 更新中",
        `${summary(cached)} · ${formatCacheAge(cached.meta?.cacheAgeMs)}`
      );
    } else {
      setCardState(
        card,
        "loading",
        "Emperor 連接中",
        "正在經 Worker 取得英皇戲院上映及即將上映資料。"
      );
    }

    try {
      const catalogue = await provider.refreshCatalogue();
      publishCatalogue(catalogue);

      if (catalogue.meta?.partial) {
        setCardState(
          card,
          "loading",
          "Emperor 部分資料已連接",
          summary(catalogue)
        );
      } else {
        setCardState(
          card,
          "ready",
          "Emperor 已連接",
          summary(catalogue)
        );
      }
    } catch (error) {
      if (cached) {
        setCardState(
          card,
          "loading",
          "Emperor 使用快取資料",
          `${summary(cached)} · 暫時未能更新`
        );
      } else {
        setCardState(
          card,
          "error",
          "Emperor 暫時無法連接",
          error?.name === "AbortError"
            ? "Emperor 連線逾時；Broadway 與 MCL 功能不受影響。"
            : `Worker 讀取失敗：${error instanceof Error ? error.message : String(error)}`
        );
      }
    } finally {
      refreshInFlight = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadEmperorStatus, { once: true });
  } else {
    loadEmperorStatus();
  }

  document.querySelector("#refreshButton")?.addEventListener("click", loadEmperorStatus);
})();
