(() => {
  let observer = null;
  let scheduled = false;

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function parseMoney(value) {
    const match = String(value || "").match(/\$\s*([\d.]+)/);
    if (!match) return null;
    const number = Number(match[1]);
    return Number.isFinite(number) ? number : null;
  }

  function parseTime(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    return Number.isFinite(minutes) ? minutes : null;
  }

  function parseSeats(card) {
    const dataAvailable = Number(card?.dataset?.seatAvailable);
    const dataTotal = Number(card?.dataset?.seatTotal);

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

    const text = card
      .querySelector(".provider-compare-seat")
      ?.textContent
      ?.trim() || "";
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
    ) {
      return null;
    }

    return {
      available,
      total,
      ratio: available / total
    };
  }

  function parseCard(card, index) {
    const source = card.querySelector(".provider-compare-source");
    const provider = source?.classList.contains("mcl")
      ? "mcl"
      : "broadway";
    const providerLabel = provider === "mcl" ? "MCL" : "Broadway";
    const time = card
      .querySelector(".provider-compare-show-time")
      ?.textContent
      ?.trim() || "--:--";
    const cinema = card
      .querySelector(".provider-compare-show-topline strong")
      ?.textContent
      ?.trim() || "戲院";
    const price = parseMoney(
      card.querySelector(".provider-compare-show-price")?.textContent
    );

    return {
      card,
      index,
      provider,
      providerLabel,
      time,
      timeMinutes: parseTime(time),
      cinema,
      price,
      seats: parseSeats(card)
    };
  }

  function lowestPrice(items) {
    const eligible = items.filter(item => Number.isFinite(item.price));
    if (!eligible.length) return null;

    return eligible.slice().sort((a, b) =>
      a.price - b.price ||
      (a.timeMinutes ?? Number.MAX_SAFE_INTEGER) -
        (b.timeMinutes ?? Number.MAX_SAFE_INTEGER) ||
      a.index - b.index
    )[0];
  }

  function roomiest(items) {
    const eligible = items.filter(item => item.seats);
    if (!eligible.length) return null;

    return eligible.slice().sort((a, b) =>
      b.seats.ratio - a.seats.ratio ||
      b.seats.available - a.seats.available ||
      (a.timeMinutes ?? Number.MAX_SAFE_INTEGER) -
        (b.timeMinutes ?? Number.MAX_SAFE_INTEGER) ||
      a.index - b.index
    )[0];
  }

  function balanced(items) {
    const eligible = items.filter(item =>
      Number.isFinite(item.price) &&
      Number.isFinite(item.timeMinutes) &&
      item.seats
    );

    if (!eligible.length) return null;

    const prices = eligible.map(item => item.price);
    const times = eligible.map(item => item.timeMinutes);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const priceRange = Math.max(1, maxPrice - minPrice);
    const timeRange = Math.max(1, maxTime - minTime);

    const scored = eligible.map(item => {
      const priceScore = clamp((maxPrice - item.price) / priceRange);
      const seatScore = clamp(item.seats.ratio);
      const earlyScore = clamp((maxTime - item.timeMinutes) / timeRange);
      const score =
        priceScore * 0.50 +
        seatScore * 0.35 +
        earlyScore * 0.15;

      return {
        ...item,
        score,
        scoreParts: {
          price: priceScore,
          seats: seatScore,
          time: earlyScore
        }
      };
    });

    return scored.sort((a, b) =>
      b.score - a.score ||
      a.price - b.price ||
      b.seats.ratio - a.seats.ratio ||
      a.timeMinutes - b.timeMinutes ||
      a.index - b.index
    )[0];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function recommendationCard(label, item, kind) {
    if (!item) {
      return `
        <article class="provider-compare-recommendation ${kind}">
          <span>${escapeHtml(label)}</span>
          <strong>—</strong>
          <small>目前資料不足</small>
        </article>
      `;
    }

    let value = item.time;
    let detail = `${item.providerLabel} · ${item.cinema}`;

    if (kind === "saving") {
      value = `$${item.price}`;
      detail = `${item.providerLabel} · ${item.time} · ${item.cinema}`;
    } else if (kind === "seats") {
      const percentage = Math.round(item.seats.ratio * 100);
      value = `${percentage}% 可選`;
      detail = `${item.providerLabel} · ${item.time} · ${item.seats.available}/${item.seats.total}`;
    } else if (kind === "balanced") {
      value = `${Math.round(item.score * 100)} 分`;
      detail = `${item.providerLabel} · ${item.time} · $${item.price} · ${Math.round(item.seats.ratio * 100)}% 可選`;
    }

    return `
      <article class="provider-compare-recommendation ${kind}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(detail)}</small>
      </article>
    `;
  }

  function clearCardMarks(timeline) {
    timeline
      .querySelectorAll(".provider-compare-show.is-balanced-pick")
      .forEach(card => card.classList.remove("is-balanced-pick"));
  }

  function render() {
    scheduled = false;

    const content = document.querySelector("#providerCompareContent");
    const timeline = content?.querySelector(".provider-compare-timeline");
    const section = timeline?.closest(".provider-compare-timeline-section");

    if (!timeline || !section) return;

    const cards = Array.from(
      timeline.querySelectorAll(":scope > .provider-compare-show")
    ).filter(card => !card.hidden);
    const items = cards.map(parseCard);

    const saving = lowestPrice(items);
    const seats = roomiest(items);
    const pick = balanced(items);

    clearCardMarks(timeline);
    if (pick?.card) pick.card.classList.add("is-balanced-pick");

    let panel = section.querySelector("[data-provider-recommendations]");
    if (!panel) {
      panel = document.createElement("div");
      panel.dataset.providerRecommendations = "true";
      panel.className = "provider-compare-recommendations";

      const insights = section.querySelector("[data-provider-insights]");
      if (insights) {
        insights.insertAdjacentElement("afterend", panel);
      } else {
        const heading = section.querySelector(".provider-compare-section-heading");
        heading?.insertAdjacentElement("afterend", panel);
      }
    }

    panel.innerHTML = `
      <div class="provider-compare-recommendation-heading">
        <div>
          <span>SMART PICKS</span>
          <strong>推薦場次</strong>
        </div>
        <small>按目前篩選結果計算</small>
      </div>

      <div class="provider-compare-recommendation-grid">
        ${recommendationCard("最慳場次", saving, "saving")}
        ${recommendationCard("座位最鬆動", seats, "seats")}
        ${recommendationCard("平衡推薦", pick, "balanced")}
      </div>

      <p class="provider-compare-recommendation-note">
        平衡推薦＝價格 50% + 可選座位比例 35% + 較早時間 15%。只使用已有可靠票價、時間及座位比例的場次；MCL 座位 lazy loading 後會自動更新。這是排序參考，不代表所有觀眾的主觀最佳選擇。
      </p>
    `;
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function install() {
    const overlay = document.querySelector("#providerCompareOverlay");
    const content = overlay?.querySelector("#providerCompareContent");

    if (!content) {
      requestAnimationFrame(install);
      return;
    }

    observer = new MutationObserver(scheduleRender);
    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "data-seat-available", "data-seat-total"]
    });

    window.addEventListener("hkcinema:compare-seat-summary", scheduleRender);
    document.addEventListener("click", event => {
      if (
        event.target.closest("[data-insight-provider]") ||
        event.target.closest("[data-insight-sort]") ||
        event.target.closest("[data-provider-compare-date]")
      ) {
        scheduleRender();
      }
    }, true);

    scheduleRender();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
