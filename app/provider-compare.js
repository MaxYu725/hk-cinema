(() => {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getMatch(matchId) {
    return window.HKCinemaProviderMatches?.get?.(matchId) || null;
  }

  function ensureOverlay() {
    let overlay = document.querySelector("#providerCompareOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "providerCompareOverlay";
    overlay.className = "provider-compare-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="provider-compare-backdrop" data-provider-compare-close></div>
      <aside class="provider-compare-sheet" role="dialog" aria-modal="true" aria-label="院線比較">
        <button type="button" class="provider-compare-close" data-provider-compare-close aria-label="關閉比較">×</button>
        <div id="providerCompareContent"></div>
      </aside>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function close() {
    const overlay = document.querySelector("#providerCompareOverlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("provider-compare-open");
  }

  function render(match) {
    const overlay = ensureOverlay();
    const content = overlay.querySelector("#providerCompareContent");
    const mclMovie = match.mcl?.movie || {};
    const poster =
      match.broadway?.poster ||
      mclMovie.poster ||
      null;

    content.innerHTML = `
      <div class="provider-compare-hero">
        ${
          poster
            ? `<img src="${escapeHtml(poster)}" alt="${escapeHtml(match.title)}">`
            : `<div class="provider-compare-poster-placeholder">HK</div>`
        }
        <div>
          <p class="eyebrow">BROADWAY × MCL</p>
          <h1>${escapeHtml(match.title)}</h1>
          <div class="provider-compare-status">
            <span>已配對</span>
            <small>精確標題 · 信心 ${Math.round((match.confidence || 0) * 100)}%</small>
          </div>
        </div>
      </div>

      <section class="provider-compare-section">
        <h2>院線來源</h2>
        <div class="provider-compare-providers">
          <article class="provider-compare-provider broadway">
            <strong>Broadway</strong>
            <span>電影 ID ${escapeHtml(match.broadway?.sourceId || "—")}</span>
            <small>現有 Broadway 詳情、場次、票價及座位圖維持不變。</small>
          </article>

          <article class="provider-compare-provider mcl">
            <strong>MCL</strong>
            <span>電影 ID ${escapeHtml(match.mcl?.sourceId || "—")}</span>
            <small>現有 MCL 詳情、票價及官方幾何座位圖維持不變。</small>
            <button type="button" class="provider-compare-provider-action" data-provider-compare-mcl="${escapeHtml(match.mcl?.sourceId || "")}">查看 MCL 詳情</button>
          </article>
        </div>
      </section>

      <section class="provider-compare-section provider-compare-next">
        <p class="eyebrow">PHASE 5A</p>
        <h2>跨院線電影身份已建立</h2>
        <p>
          下一小步會以這個 match record 為基礎，取得 Broadway 與 MCL 的共同日期，然後把同一天的所有場次放入同一條時間線。
        </p>
      </section>
    `;

    overlay.hidden = false;
    document.body.classList.add("provider-compare-open");
  }

  function open(matchId) {
    const match = getMatch(matchId);
    if (!match) return false;
    render(match);
    return true;
  }

  window.HKCinemaProviderCompare = {
    open,
    close
  };

  document.addEventListener("click", event => {
    const openButton = event.target.closest("[data-compare-open]");
    if (openButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      open(openButton.dataset.compareOpen);
      return;
    }

    if (event.target.closest("[data-provider-compare-close]")) {
      event.preventDefault();
      close();
      return;
    }

    const mclButton = event.target.closest("[data-provider-compare-mcl]");
    if (mclButton) {
      event.preventDefault();
      const match = Array.from(
        window.HKCinemaProviderMatches?.all?.() || []
      ).find(item =>
        String(item.mcl?.sourceId) ===
        String(mclButton.dataset.providerCompareMcl)
      );

      close();
      const movie = match?.mcl?.movie;
      if (movie) {
        window.HKCinemaMCLDetail?.open?.(movie);
      }
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      !document.querySelector("#providerCompareOverlay")?.hidden
    ) {
      close();
    }
  });
})();
