(() => {
  const sharedCore = window.HKCinemaProviderSharedCore || null;
  let scheduled = false;
  let jumpTimer = null;
  let clockTimer = null;

  const clamp = value => Math.min(1, Math.max(0, value));
  const HK_TIME_ZONE = "Asia/Hong_Kong";

  function comparisonStore() {
    return window.HKCinemaComparisonStore || null;
  }

  function comparisonState() {
    return comparisonStore()?.getState?.() || { selectedDate: null, sessions: [], filters: {} };
  }

  function providerOf(value) {
    const sessionId = value?.dataset?.comparisonSessionId;
    const stored = value?.provider ? value : sessionId ? comparisonState().sessions.find(session => session.id === sessionId) : null;
    const explicit = String(stored?.provider || "").trim().toLowerCase();
    const key = sharedCore?.registeredProviderId?.(explicit) || explicit || "unknown";
    return { key, label: sharedCore?.label?.(key) || key || "院線" };
  }

  function item(value, index = 0) {
    const sessionId = value?.dataset?.comparisonSessionId || value?.id || value?.comparisonId;
    const session = value?.provider
      ? value
      : comparisonState().sessions.find(stored => stored.id === sessionId);
    if (!session) return null;
    return {
      ...session,
      key: session.id,
      index: session.index ?? index,
      timeMinutes: session.timeMinutes,
      cinema: session.canonicalCinema || session.cinemaName || session.cinema || "戲院"
    };
  }

  function hongKongClock(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: HK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
    return { date, minutes: currentMinutes };
  }

  function selectedDate() {
    return comparisonState().selectedDate || window.HKCinemaProviderCompare?.getState?.()?.selectedDate || null;
  }

  function recommendationPool(items, now = new Date()) {
    const available = items.filter(entry => !entry.seats || entry.seats.available > 0);
    const clock = hongKongClock(now);
    if (selectedDate() !== clock.date) return available;
    return available.filter(entry => (
      !Number.isFinite(entry.timeMinutes) || entry.timeMinutes > clock.minutes
    ));
  }

  function cheapest(items) {
    return items
      .filter(entry => Number.isFinite(entry.price))
      .sort((a, b) => (
        a.price - b.price ||
        (a.timeMinutes ?? 9999) - (b.timeMinutes ?? 9999) ||
        a.index - b.index
      ))[0] || null;
  }

  function earliest(items) {
    return items
      .filter(entry => Number.isFinite(entry.timeMinutes))
      .sort((a, b) => (
        a.timeMinutes - b.timeMinutes ||
        (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY) ||
        a.index - b.index
      ))[0] || null;
  }

  function roomiest(items) {
    return items
      .filter(entry => entry.seats)
      .sort((a, b) => (
        b.seats.ratio - a.seats.ratio ||
        b.seats.available - a.seats.available ||
        (a.timeMinutes ?? 9999) - (b.timeMinutes ?? 9999) ||
        a.index - b.index
      ))[0] || null;
  }

  function normalizedUtility(value, min, max, invert = false) {
    if (!Number.isFinite(value)) return null;
    if (max <= min) return 1;
    const normalized = clamp((value - min) / (max - min));
    return invert ? 1 - normalized : normalized;
  }

  function scoreCandidates(items, mode) {
    const prices = items.filter(entry => Number.isFinite(entry.price)).map(entry => entry.price);
    const times = items.filter(entry => Number.isFinite(entry.timeMinutes)).map(entry => entry.timeMinutes);
    const minPrice = prices.length ? Math.min(...prices) : null;
    const maxPrice = prices.length ? Math.max(...prices) : null;
    const minTime = times.length ? Math.min(...times) : null;
    const maxTime = times.length ? Math.max(...times) : null;

    return items.map(entry => {
      const priceScore = Number.isFinite(entry.price) && minPrice !== null && maxPrice !== null
        ? normalizedUtility(entry.price, minPrice, maxPrice, true)
        : null;
      const timeScore = Number.isFinite(entry.timeMinutes) && minTime !== null && maxTime !== null
        ? normalizedUtility(entry.timeMinutes, minTime, maxTime, true)
        : null;
      const seatScore = entry.seats ? clamp(entry.seats.ratio) : null;

      let score = null;
      if (mode === "full") {
        score = priceScore * 0.45 + seatScore * 0.35 + timeScore * 0.20;
      } else if (mode === "price-time") {
        score = priceScore * 0.70 + timeScore * 0.30;
      } else if (mode === "seat-time") {
        score = seatScore * 0.70 + timeScore * 0.30;
      }
      return { ...entry, score, balanceMode: mode };
    });
  }

  function balanced(items) {
    const full = items.filter(entry => (
      Number.isFinite(entry.price) && Number.isFinite(entry.timeMinutes) && entry.seats
    ));
    const priceTime = items.filter(entry => (
      Number.isFinite(entry.price) && Number.isFinite(entry.timeMinutes)
    ));
    const seatTime = items.filter(entry => (
      entry.seats && Number.isFinite(entry.timeMinutes)
    ));

    let candidates = null;
    let mode = null;
    if (full.length >= 2) {
      candidates = full;
      mode = "full";
    } else if (priceTime.length >= 2) {
      candidates = priceTime;
      mode = "price-time";
    } else if (seatTime.length >= 2) {
      candidates = seatTime;
      mode = "seat-time";
    } else {
      return null;
    }

    return scoreCandidates(candidates, mode)
      .sort((a, b) => (
        b.score - a.score ||
        (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY) ||
        (b.seats?.ratio ?? -1) - (a.seats?.ratio ?? -1) ||
        a.timeMinutes - b.timeMinutes ||
        a.index - b.index
      ))[0] || null;
  }

  function buildRecommendations(items, now = new Date()) {
    const pool = recommendationPool(items, now);
    const picks = [
      { key: "cheapest", label: "最低價", entry: cheapest(pool) },
      { key: "earliest", label: "最早場", entry: earliest(pool) },
      { key: "roomiest", label: "座位最鬆", entry: roomiest(pool) },
      { key: "balanced", label: "最佳平衡", entry: balanced(pool) }
    ].filter(pick => pick.entry);

    return {
      pool,
      picks,
      coverage: {
        total: pool.length,
        price: pool.filter(entry => Number.isFinite(entry.price)).length,
        seats: pool.filter(entry => entry.seats).length,
        time: pool.filter(entry => Number.isFinite(entry.timeMinutes)).length
      }
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function details(entry) {
    return [entry.providerLabel, entry.time, entry.cinema]
      .filter(Boolean)
      .map(escapeHtml)
      .join(" · ");
  }

  function balanceDescription(entry) {
    if (entry.balanceMode === "full") return "綜合價格、座位與時間";
    if (entry.balanceMode === "price-time") return "座位資料不足，改以價格與時間比較";
    return "價格資料不足，改以座位與時間比較";
  }

  function recommendationCard(pick) {
    const entry = pick.entry;
    let value = "";
    let extra = "";

    if (pick.key === "cheapest") {
      value = `$${escapeHtml(entry.price)}`;
      extra = details(entry);
    } else if (pick.key === "earliest") {
      value = escapeHtml(entry.time);
      const price = Number.isFinite(entry.price) ? ` · $${escapeHtml(entry.price)}` : "";
      extra = `${escapeHtml(entry.providerLabel)} · ${escapeHtml(entry.cinema)}${price}`;
    } else if (pick.key === "roomiest") {
      value = `${Math.round(entry.seats.ratio * 100)}% 可用`;
      extra = `${details(entry)} · ${entry.seats.available}/${entry.seats.total}`;
    } else {
      const price = Number.isFinite(entry.price) ? `$${escapeHtml(entry.price)}` : null;
      const seat = entry.seats ? `${Math.round(entry.seats.ratio * 100)}% 可用` : null;
      value = [escapeHtml(entry.time), price, seat].filter(Boolean).join(" · ");
      extra = `${details(entry)} · ${escapeHtml(balanceDescription(entry))}`;
    }

    return `
      <button
        type="button"
        class="provider-compare-recommendation phase8d-smart-pick ${escapeHtml(pick.key)} is-clickable"
        data-recommendation-target="${escapeHtml(entry.key)}"
        data-smart-pick="${escapeHtml(pick.key)}"
        aria-label="${escapeHtml(pick.label)}：跳到 ${escapeHtml(entry.time)} ${escapeHtml(entry.cinema)} 場次"
      >
        <span>${escapeHtml(pick.label)}</span>
        <strong>${value}</strong>
        <small>${extra}</small>
        <em>查看場次 ↓</em>
      </button>
    `;
  }

  function coverageText(coverage) {
    if (!coverage.total) return "沒有可推薦場次";
    const parts = [];
    if (coverage.price < coverage.total) parts.push(`票價 ${coverage.price}/${coverage.total}`);
    if (coverage.seats < coverage.total) parts.push(`座位 ${coverage.seats}/${coverage.total}`);
    return parts.length ? `部分資料：${parts.join(" · ")}` : "價格及座位資料完整";
  }

  function clearRecommendationMarks(timeline) {
    timeline?.querySelectorAll(".is-balanced-pick").forEach(card => card.classList.remove("is-balanced-pick"));
  }

  function removePanel(section, timeline) {
    clearRecommendationMarks(timeline);
    section?.querySelector("[data-provider-recommendations]")?.remove();
    section?.querySelector("[data-phase8b-recommendation-toggle]")?.remove();
  }

  function scheduleClockRefresh() {
    clearTimeout(clockTimer);
    clockTimer = null;
    const clock = hongKongClock();
    if (selectedDate() !== clock.date) return;
    const delay = 60000 - (Date.now() % 60000) + 50;
    clockTimer = setTimeout(() => {
      clockTimer = null;
      schedule();
    }, delay);
  }

  function render() {
    scheduled = false;
    const content = document.querySelector("#providerCompareContent");
    const timeline = content?.querySelector(".provider-compare-timeline");
    const section = timeline?.closest(".provider-compare-timeline-section");
    if (!timeline || !section) return;

    const snapshot = comparisonState();
    const entries = (comparisonStore()?.selectSessions?.({
      sessions: snapshot.sessions,
      filters: snapshot.filters
    }) || snapshot.sessions).map(item).filter(Boolean);
    const model = buildRecommendations(entries);

    if (!model.picks.length) {
      removePanel(section, timeline);
      scheduleClockRefresh();
      return;
    }

    clearRecommendationMarks(timeline);
    const balancedId = model.picks.find(pick => pick.key === "balanced")?.entry?.id;
    if (balancedId) {
      Array.from(timeline.querySelectorAll(":scope > .provider-compare-show"))
        .find(card => card.dataset.comparisonSessionId === balancedId)
        ?.classList.add("is-balanced-pick");
    }

    const missingCount = 4 - model.picks.length;
    const note = missingCount
      ? `有 ${missingCount} 類推薦因可靠資料不足而隱藏；不會估算缺失票價或座位。`
      : "四類推薦均按目前篩選後的場次計算；不會估算缺失票價或座位。";
    const html = `
      <div class="provider-compare-recommendation-heading phase8d-smart-heading">
        <div><span>SMART PICKS 2</span><strong>推薦場次</strong></div>
        <small>${escapeHtml(coverageText(model.coverage))}</small>
      </div>
      <div class="provider-compare-recommendation-grid phase8d-smart-grid pick-count-${model.picks.length}">
        ${model.picks.map(recommendationCard).join("")}
      </div>
      <details class="provider-compare-recommendation-note phase8d-smart-note">
        <summary>推薦計算方式</summary>
        <p>最低價只比較已提供票價的場次；最早場在今天只選尚未開始的場次；座位最鬆只使用可靠的可用／總座位數。最佳平衡優先以價格 45%、座位 35%、較早時間 20% 計算；資料不足時會改用兩項可靠資料，無法合理比較時直接隱藏。</p>
        <p>${escapeHtml(note)}</p>
      </details>
    `;

    let panel = section.querySelector("[data-provider-recommendations]");
    if (!panel) {
      panel = document.createElement("div");
      panel.dataset.providerRecommendations = "true";
      panel.className = "provider-compare-recommendations phase8d-smart-picks";
      const insights = section.querySelector("[data-provider-insights]");
      (insights || section.querySelector(".provider-compare-section-heading"))?.insertAdjacentElement("afterend", panel);
    }
    if (panel.innerHTML !== html) panel.innerHTML = html;
    scheduleClockRefresh();
    window.HKCinemaPhase8BLayout?.refresh?.();
  }

  function jumpToRecommendation(key) {
    const timeline = document.querySelector("#providerCompareContent .provider-compare-timeline");
    if (!timeline || !key) return;
    const target = Array.from(timeline.querySelectorAll(":scope > .provider-compare-show"))
      .find(card => card.dataset.comparisonSessionId === key);
    if (!target || target.hidden) return;

    timeline.querySelectorAll(".is-recommendation-jump").forEach(card => card.classList.remove("is-recommendation-jump"));
    target.classList.add("is-recommendation-jump");
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(() => target.classList.remove("is-recommendation-jump"), 1800);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function install() {
    window.addEventListener("hkcinema:comparison-store-change", schedule);
    window.addEventListener("hkcinema:provider-compare-lifecycle", schedule);
    document.addEventListener("click", event => {
      const recommendation = event.target.closest("[data-recommendation-target]");
      if (!recommendation) return;
      event.preventDefault();
      event.stopPropagation();
      jumpToRecommendation(recommendation.dataset.recommendationTarget);
    }, true);

    schedule();
  }

  window.HKCinemaSmartPicks2 = Object.freeze({
    version: "c4-1",
    buildRecommendations,
    balanced,
    cheapest,
    earliest,
    roomiest,
    hongKongClock,
    providerOf,
    itemForCard: item,
    selectForState(snapshot = comparisonState()) {
      return comparisonStore()?.selectSessions?.({ sessions: snapshot.sessions, filters: snapshot.filters }) || snapshot.sessions || [];
    },
    refresh: schedule
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
