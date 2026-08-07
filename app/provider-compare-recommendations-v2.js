(() => {
  let scheduled = false;
  let recommendationKey = 0;
  let jumpTimer = null;

  const clamp = value => Math.min(1, Math.max(0, value));

  function money(text) {
    const match = String(text || "").match(/\$\s*([\d.]+)/);
    const value = match ? Number(match[1]) : NaN;
    return Number.isFinite(value) ? value : null;
  }

  function minutes(text) {
    const match = String(text || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const value = Number(match[1]) * 60 + Number(match[2]);
    return Number.isFinite(value) ? value : null;
  }

  function seats(card) {
    const dataAvailable = Number(card.dataset.seatAvailable);
    const dataTotal = Number(card.dataset.seatTotal);

    if (
      Number.isFinite(dataAvailable) &&
      Number.isFinite(dataTotal) &&
      dataTotal > 0 &&
      dataAvailable >= 0 &&
      dataAvailable <= dataTotal
    ) {
      return {
        available: dataAvailable,
        total: dataTotal,
        ratio: dataAvailable / dataTotal
      };
    }

    const text = card.querySelector(".provider-compare-seat")?.textContent || "";
    const match = text.match(/(\d+)\s*\/\s*(\d+)\s*可選/);
    if (!match) return null;

    const available = Number(match[1]);
    const total = Number(match[2]);
    if (
      !Number.isFinite(available) ||
      !Number.isFinite(total) ||
      total <= 0 ||
      available < 0 ||
      available > total
    ) return null;

    return { available, total, ratio: available / total };
  }

  function ensureRecommendationKey(card) {
    if (!card.dataset.recommendationKey) {
      recommendationKey += 1;
      card.dataset.recommendationKey = `show-${recommendationKey}`;
    }
    return card.dataset.recommendationKey;
  }

  function item(card, index) {
    const isMcl = Boolean(card.querySelector(".provider-compare-source.mcl"));
    const provider = isMcl ? "mcl" : "broadway";
    const providerLabel = isMcl ? "MCL" : "Broadway";
    const time = card.querySelector(".provider-compare-show-time")?.textContent?.trim() || "--:--";

    return {
      card,
      key: ensureRecommendationKey(card),
      index,
      provider,
      providerLabel,
      time,
      timeMinutes: minutes(time),
      cinema: card.querySelector(".provider-compare-show-topline strong")?.textContent?.trim() || "戲院",
      price: money(card.querySelector(".provider-compare-show-price")?.textContent),
      seats: seats(card)
    };
  }

  function cheapest(items) {
    return items
      .filter(entry => Number.isFinite(entry.price))
      .sort((a, b) =>
        a.price - b.price ||
        (a.timeMinutes ?? 9999) - (b.timeMinutes ?? 9999) ||
        a.index - b.index
      )[0] || null;
  }

  function roomiest(items) {
    return items
      .filter(entry => entry.seats)
      .sort((a, b) =>
        b.seats.ratio - a.seats.ratio ||
        b.seats.available - a.seats.available ||
        (a.timeMinutes ?? 9999) - (b.timeMinutes ?? 9999) ||
        a.index - b.index
      )[0] || null;
  }

  function balanced(items) {
    const eligible = items.filter(entry =>
      Number.isFinite(entry.price) &&
      Number.isFinite(entry.timeMinutes) &&
      entry.seats
    );
    if (!eligible.length) return null;

    const prices = eligible.map(entry => entry.price);
    const times = eligible.map(entry => entry.timeMinutes);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const priceRange = Math.max(1, maxPrice - minPrice);
    const timeRange = Math.max(1, maxTime - minTime);

    return eligible
      .map(entry => ({
        ...entry,
        score:
          clamp((maxPrice - entry.price) / priceRange) * 0.50 +
          clamp(entry.seats.ratio) * 0.35 +
          clamp((maxTime - entry.timeMinutes) / timeRange) * 0.15
      }))
      .sort((a, b) =>
        b.score - a.score ||
        a.price - b.price ||
        b.seats.ratio - a.seats.ratio ||
        a.timeMinutes - b.timeMinutes
      )[0] || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function recommendationDetails(entry, includeProvider = true) {
    const parts = [];
    if (includeProvider) parts.push(entry.providerLabel);
    parts.push(entry.time, entry.cinema);
    return parts.map(escapeHtml).join(" · ");
  }

  function recommendationShell(entry, className, content) {
    if (!entry) {
      return `<article class="provider-compare-recommendation ${className} is-unavailable">${content}</article>`;
    }

    return `
      <button
        type="button"
        class="provider-compare-recommendation ${className} is-clickable"
        data-recommendation-target="${escapeHtml(entry.key)}"
        aria-label="跳到 ${escapeHtml(entry.time)} ${escapeHtml(entry.cinema)} 場次"
      >${content}<em>查看場次 ↓</em></button>
    `;
  }

  function cardHtml(label, entry, type) {
    if (!entry) {
      return recommendationShell(
        null,
        type,
        `<span>${escapeHtml(label)}</span><strong>—</strong><small>目前資料不足</small>`
      );
    }

    if (type === "saving") {
      return recommendationShell(
        entry,
        type,
        `<span>${escapeHtml(label)}</span><strong>$${escapeHtml(entry.price)}</strong><small>${recommendationDetails(entry)}</small>`
      );
    }

    if (type === "seats") {
      return recommendationShell(
        entry,
        type,
        `<span>${escapeHtml(label)}</span><strong>${Math.round(entry.seats.ratio * 100)}% 可選</strong><small>${recommendationDetails(entry)} · ${entry.seats.available}/${entry.seats.total}</small>`
      );
    }

    if (type === "balanced") {
      return recommendationShell(
        entry,
        type,
        `<span>${escapeHtml(label)}</span><strong>${Math.round(entry.score * 100)} 分</strong><small>${recommendationDetails(entry)} · $${escapeHtml(entry.price)} · ${Math.round(entry.seats.ratio * 100)}% 可選</small>`
      );
    }

    return recommendationShell(
      entry,
      type,
      `<span>${escapeHtml(label)}</span><strong>${Math.round(entry.score * 100)} 分</strong><small>${recommendationDetails(entry, false)} · $${escapeHtml(entry.price)} · ${Math.round(entry.seats.ratio * 100)}% 可選</small>`
    );
  }

  function render() {
    scheduled = false;
    const content = document.querySelector("#providerCompareContent");
    const timeline = content?.querySelector(".provider-compare-timeline");
    const section = timeline?.closest(".provider-compare-timeline-section");
    if (!timeline || !section) return;

    const entries = Array.from(
      timeline.querySelectorAll(":scope > .provider-compare-show")
    )
      .filter(card => !card.hidden)
      .map(item);

    const saving = cheapest(entries);
    const roomy = roomiest(entries);
    const pick = balanced(entries);
    const broadwayPick = balanced(entries.filter(entry => entry.provider === "broadway"));
    const mclPick = balanced(entries.filter(entry => entry.provider === "mcl"));

    timeline.querySelectorAll(".is-balanced-pick").forEach(card => {
      card.classList.remove("is-balanced-pick");
    });
    pick?.card?.classList.add("is-balanced-pick");

    const html = `
      <div class="provider-compare-recommendation-heading">
        <div><span>SMART PICKS</span><strong>推薦場次</strong></div>
        <small>點推薦可跳到場次</small>
      </div>
      <div class="provider-compare-recommendation-grid">
        ${cardHtml("全院線最慳", saving, "saving")}
        ${cardHtml("全院線座位最鬆", roomy, "seats")}
        ${cardHtml("全院線平衡推薦", pick, "balanced")}
      </div>
      <div class="provider-compare-provider-picks">
        ${cardHtml("Broadway 平衡推薦", broadwayPick, "provider broadway")}
        ${cardHtml("MCL 平衡推薦", mclPick, "provider mcl")}
      </div>
      <p class="provider-compare-recommendation-note">平衡推薦＝價格 50% + 可選座位比例 35% + 較早時間 15%。所有推薦均顯示時間及戲院名稱；點推薦只會跳到時間線中的相應場次，不會直接離開 HK Cinema。只使用已有可靠票價、時間及座位比例的場次；MCL 座位 lazy loading 後會自動更新。</p>
    `;

    let panel = section.querySelector("[data-provider-recommendations]");
    if (!panel) {
      panel = document.createElement("div");
      panel.dataset.providerRecommendations = "true";
      panel.className = "provider-compare-recommendations";
      const insights = section.querySelector("[data-provider-insights]");
      (insights || section.querySelector(".provider-compare-section-heading"))
        ?.insertAdjacentElement("afterend", panel);
    }

    if (panel.innerHTML !== html) panel.innerHTML = html;
  }

  function jumpToRecommendation(key) {
    const timeline = document.querySelector(
      "#providerCompareContent .provider-compare-timeline"
    );
    if (!timeline || !key) return;

    const target = Array.from(
      timeline.querySelectorAll(":scope > .provider-compare-show")
    ).find(card => card.dataset.recommendationKey === key);

    if (!target || target.hidden) return;

    timeline.querySelectorAll(".is-recommendation-jump").forEach(card => {
      card.classList.remove("is-recommendation-jump");
    });

    target.classList.add("is-recommendation-jump");
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });

    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => {
      target.classList.remove("is-recommendation-jump");
    }, 1800);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function install() {
    const content = document.querySelector("#providerCompareContent");
    if (!content) {
      requestAnimationFrame(install);
      return;
    }

    const observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        const node = record.target.nodeType === 1
          ? record.target
          : record.target.parentElement;
        return !node?.closest?.("[data-provider-recommendations]");
      });
      if (relevant) schedule();
    });

    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "data-seat-available", "data-seat-total"]
    });

    window.addEventListener("hkcinema:compare-seat-summary", schedule);
    document.addEventListener("click", event => {
      const recommendation = event.target.closest("[data-recommendation-target]");
      if (recommendation) {
        event.preventDefault();
        event.stopPropagation();
        jumpToRecommendation(recommendation.dataset.recommendationTarget);
        return;
      }

      if (
        event.target.closest("[data-insight-provider]") ||
        event.target.closest("[data-insight-sort]") ||
        event.target.closest("[data-provider-compare-date]")
      ) schedule();
    }, true);

    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
