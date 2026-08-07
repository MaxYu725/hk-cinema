(() => {
  function setCardState(card, status, title, text) {
    card.dataset.status = status;

    const strong = card.querySelector("strong");
    const paragraph = card.querySelector("p");

    if (strong) strong.textContent = title;
    if (paragraph) paragraph.textContent = text;
  }

  function ensureCard() {
    let card = document.querySelector("#mclStatus");

    if (card) {
      return card;
    }

    const broadwayStatus =
      document.querySelector("#systemStatus");

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

    if (broadwayStatus) {
      broadwayStatus.insertAdjacentElement("afterend", card);
    }

    return card;
  }

  async function loadMCLStatus() {
    const card = ensureCard();
    const provider =
      window.HKCinemaProviders?.mcl;

    if (!provider) {
      setCardState(
        card,
        "error",
        "MCL 未連接",
        "MCL provider 未能載入。"
      );
      return;
    }

    try {
      const catalogue =
        await provider.getCatalogue();

      window.HKCinemaMCLCatalogue = catalogue;

      setCardState(
        card,
        "ready",
        "MCL 已連接",
        `現正上映 ${catalogue.now.length} 部 · 即將上映 ${catalogue.coming.length} 部 · 特別節目 ${catalogue.festival.length} 部`
      );
    } catch (error) {
      const message =
        error?.name === "AbortError"
          ? "MCL 連線逾時；Broadway 功能不受影響。"
          : `瀏覽器直連失敗：${error instanceof Error ? error.message : String(error)}`;

      setCardState(
        card,
        "error",
        "MCL 暫時無法連接",
        message
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      loadMCLStatus,
      { once: true }
    );
  } else {
    loadMCLStatus();
  }
})();
