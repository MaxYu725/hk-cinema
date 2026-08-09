(() => {
  const DEFAULT_FILTERS = Object.freeze({
    provider: "all",
    region: "all",
    cinema: "all",
    period: "all",
    sort: "time"
  });

  const FILTER_LABELS = Object.freeze({
    provider: {
      broadway: "Broadway",
      mcl: "MCL",
      emperor: "Emperor"
    },
    region: {
      hk: "港島",
      kln: "九龍",
      "nt-islands": "新界/離島"
    },
    period: {
      morning: "早場",
      afternoon: "下午",
      evening: "晚場"
    },
    sort: {
      price: "價格排序",
      seats: "座位排序"
    }
  });

  let contentObserver = null;
  let waitingObserver = null;
  let scheduled = false;
  let applying = false;
  let installed = false;

  function contentRoot() {
    return document.querySelector("#providerCompareContent");
  }

  function filtersApi() {
    return window.HKCinemaProviderCompareFilters || null;
  }

  function compareState() {
    return window.HKCinemaProviderCompare?.getState?.() || null;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function currentFilterState() {
    const value = filtersApi()?.getState?.() || {};
    return {
      provider: value.provider || DEFAULT_FILTERS.provider,
      region: value.region || DEFAULT_FILTERS.region,
      cinema: value.cinema || DEFAULT_FILTERS.cinema,
      period: value.period || DEFAULT_FILTERS.period,
      sort: value.sort || DEFAULT_FILTERS.sort
    };
  }

  function cinemaLabel(state) {
    if (state.cinema === "all") return "";
    const option = document.querySelector(`#providerCompareContent [data-insight-cinema] option[value="${CSS.escape(state.cinema)}"]`);
    const text = option?.textContent?.trim() || "指定戲院";
    return text.replace(/\s*·\s*\d+\s*場\s*$/, "");
  }

  function activeFilters() {
    const state = currentFilterState();
    const filters = [];

    if (state.provider !== DEFAULT_FILTERS.provider) {
      filters.push({ key: "provider", label: FILTER_LABELS.provider[state.provider] || state.provider });
    }
    if (state.region !== DEFAULT_FILTERS.region) {
      filters.push({ key: "region", label: FILTER_LABELS.region[state.region] || state.region });
    }
    if (state.cinema !== DEFAULT_FILTERS.cinema) {
      filters.push({ key: "cinema", label: cinemaLabel(state) || "指定戲院" });
    }
    if (state.period !== DEFAULT_FILTERS.period) {
      filters.push({ key: "period", label: FILTER_LABELS.period[state.period] || state.period });
    }
    if (state.sort !== DEFAULT_FILTERS.sort) {
      filters.push({ key: "sort", label: FILTER_LABELS.sort[state.sort] || state.sort });
    }

    return filters;
  }

  function enhancePoster(root) {
    const poster = root.querySelector(".provider-compare-hero img");
    if (!poster || poster.dataset.phase6mPoster === "true") return;
    poster.dataset.phase6mPoster = "true";
    poster.decoding = "async";
    poster.fetchPriority = "high";
    if (!poster.hasAttribute("width")) poster.setAttribute("width", "120");
    if (!poster.hasAttribute("height")) poster.setAttribute("height", "180");
  }

  function markMissingInsights(root) {
    root.querySelectorAll(".provider-compare-insight").forEach(card => {
      const missing = card.querySelector("strong")?.textContent?.trim() === "—";
      card.classList.toggle("phase6m-missing", missing);
    });
  }

  function enhanceDateRail(root) {
    const rail = root.querySelector(".provider-compare-date-rail");
    if (!rail) return;

    const filters = activeFilters();
    let shortcut = rail.querySelector("[data-phase6m-filter-shortcut]");
    if (!shortcut) {
      shortcut = document.createElement("button");
      shortcut.type = "button";
      shortcut.className = "phase6m-filter-shortcut";
      shortcut.dataset.phase6mFilterShortcut = "true";
      rail.appendChild(shortcut);
    }

    const label = filters.length ? `篩選 ${filters.length}` : "篩選";
    if (shortcut.textContent !== label) shortcut.textContent = label;
    shortcut.classList.toggle("active", filters.length > 0);
    shortcut.setAttribute("aria-label", filters.length ? `開啟篩選，目前 ${filters.length} 個條件生效` : "開啟場次篩選");
  }

  function filteredEmptyText() {
    const filters = activeFilters();
    if (!filters.length) return "目前沒有符合條件的場次。";
    return `目前 ${filters.map(filter => filter.label).join("、")} 沒有相符場次。`;
  }

  function emptyContainer(className) {
    const empty = document.createElement("div");
    empty.className = `provider-compare-empty ${className}`.trim();
    empty.setAttribute("role", "status");
    empty.setAttribute("aria-live", "polite");
    return empty;
  }

  function addEmptyCopy(empty, title, message) {
    const strong = document.createElement("strong");
    strong.textContent = title;
    const span = document.createElement("span");
    span.textContent = message;
    empty.append(strong, span);
  }

  function actionButton(attribute, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(attribute, "");
    button.textContent = label;
    return button;
  }

  function enhanceFilteredEmpty(root) {
    const timeline = root.querySelector(".provider-compare-timeline");
    if (!timeline) return;
    const cards = Array.from(timeline.querySelectorAll(":scope > .provider-compare-show"));
    const visible = cards.filter(card => !card.hidden);
    let empty = root.querySelector("[data-phase6m-filter-empty]");

    if (!cards.length || visible.length) {
      empty?.remove();
      return;
    }

    const message = filteredEmptyText();
    if (empty?.dataset.message === message) return;
    empty?.remove();

    empty = emptyContainer("phase6m-filter-empty");
    empty.dataset.phase6mFilterEmpty = "true";
    empty.dataset.message = message;
    addEmptyCopy(empty, "沒有符合目前篩選的場次", message);
    empty.appendChild(actionButton("data-provider-compare-reset", "清除全部篩選"));
    timeline.insertAdjacentElement("beforebegin", empty);
  }

  function enhanceBaseEmpty(root) {
    const state = compareState();
    const errors = Object.entries(state?.errors || {}).filter(([, value]) => Boolean(value));

    root.querySelectorAll(".provider-compare-empty:not([data-phase6m-filter-empty])").forEach(empty => {
      if (empty.dataset.phase6mEmpty === "true") return;
      empty.dataset.phase6mEmpty = "true";

      const context = document.createElement("span");
      context.className = "phase6m-empty-context";
      context.textContent = errors.length
        ? "部分院線暫時未能更新；可重試資料，或先切換其他日期。"
        : "可切換上方日期；院線新增場次後重新載入即可查看。";
      empty.appendChild(context);

      const actions = document.createElement("div");
      actions.className = "phase6m-empty-actions";
      actions.appendChild(actionButton("data-provider-compare-retry", "重新載入"));
      empty.appendChild(actions);
    });
  }

  function enhanceNoDates(root) {
    const state = compareState();
    const existing = root.querySelector("[data-phase6m-no-dates]");
    if (!state?.match || root.querySelector(".provider-compare-loading") || state.selectedDate) {
      existing?.remove();
      return;
    }

    const availableCount = Object.values(state.availableDates || {})
      .reduce((total, dates) => total + (Array.isArray(dates) ? dates.length : 0), 0);
    if (availableCount > 0) {
      existing?.remove();
      return;
    }

    if (existing) return;
    const errors = Object.values(state.errors || {}).filter(Boolean);
    const section = document.createElement("section");
    section.className = "provider-compare-section phase6m-empty-section";
    section.dataset.phase6mNoDates = "true";

    const empty = emptyContainer("");
    empty.dataset.phase6mEmpty = "true";
    addEmptyCopy(
      empty,
      errors.length ? "暫未取得可售日期" : "目前沒有可售日期",
      errors.length
        ? "部分或全部院線暫時未能更新，已載入的資料仍會保留。"
        : "院線目前未提供這部電影的可售日期。"
    );
    const actions = document.createElement("div");
    actions.className = "phase6m-empty-actions";
    actions.appendChild(actionButton("data-provider-compare-retry", "重新載入"));
    empty.appendChild(actions);
    section.appendChild(empty);
    root.appendChild(section);
  }

  function enhance() {
    scheduled = false;
    if (applying) return;
    const root = contentRoot();
    if (!root) return;

    applying = true;
    try {
      enhancePoster(root);
      markMissingInsights(root);
      enhanceDateRail(root);
      enhanceFilteredEmpty(root);
      enhanceBaseEmpty(root);
      enhanceNoDates(root);
    } finally {
      applying = false;
    }
  }

  function openFiltersFromShortcut() {
    const toggle = document.querySelector("#providerCompareContent [data-provider-filter-toggle]");
    if (!toggle) return;
    if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
    requestAnimationFrame(() => {
      document.querySelector("#providerCompareContent .provider-compare-controls")
        ?.scrollIntoView?.({ behavior: "smooth", block: "start", inline: "nearest" });
    });
  }

  function handleClick(event) {
    const shortcut = event.target.closest?.("[data-phase6m-filter-shortcut]");
    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      openFiltersFromShortcut();
    }
  }

  function attach(root) {
    if (!root || root.dataset.phase6mAttached === "true") return;
    root.dataset.phase6mAttached = "true";

    contentObserver?.disconnect();
    contentObserver = new MutationObserver(() => {
      if (!applying) schedule();
    });
    contentObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "data-seat-available", "data-seat-total"]
    });
    schedule();
  }

  function install() {
    if (installed) return;
    installed = true;
    document.addEventListener("click", handleClick, true);
    window.addEventListener("hkcinema:provider-compare-lifecycle", schedule);
    window.addEventListener("hkcinema:compare-seat-summary", schedule);

    const root = contentRoot();
    if (root) {
      attach(root);
      return;
    }

    waitingObserver = new MutationObserver(() => {
      const current = contentRoot();
      if (!current) return;
      waitingObserver?.disconnect();
      waitingObserver = null;
      attach(current);
    });
    waitingObserver.observe(document.body, { childList: true });
  }

  window.HKCinemaProviderComparePhase6M = Object.freeze({
    refresh: schedule,
    getActiveFilters: activeFilters
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
