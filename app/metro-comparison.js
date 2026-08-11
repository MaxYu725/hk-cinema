(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  const PIVOTS = [
    { key: "showtimes", label: "場次" },
    { key: "picks", label: "推薦" },
    { key: "filters", label: "篩選" }
  ];
  const HIDDEN_CLASS = "metro-comparison-pivot-hidden";

  let activePivot = "showtimes";
  let activeComparisonId = null;
  let scheduled = false;
  let applying = false;

  function comparisonId() {
    return window.HKCinemaProviderCompare?.getState?.().match?.id || null;
  }

  function resetForComparison() {
    const id = comparisonId();
    if (id === activeComparisonId) return;
    activeComparisonId = id;
    activePivot = "showtimes";
  }

  function pivotMarkup() {
    return `
      <div class="metro-comparison-pivot-track" role="tablist" aria-label="比較內容">
        ${PIVOTS.map((pivot, index) => `
          <button
            type="button"
            class="metro-comparison-pivot-tab"
            role="tab"
            data-metro-comparison-pivot-tab="${pivot.key}"
            aria-selected="${index === 0 ? "true" : "false"}"
            tabindex="${index === 0 ? "0" : "-1"}"
          >${pivot.label}</button>
        `).join("")}
      </div>
    `;
  }

  function ensurePivot(root) {
    const timelineSection = root.querySelector(".phase8b-timeline-section");
    if (!timelineSection) return null;

    let nav = root.querySelector("[data-metro-comparison-pivot]");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "metro-comparison-pivot";
      nav.dataset.metroComparisonPivot = "true";
      nav.setAttribute("aria-label", "場次比較導覽");
      nav.innerHTML = pivotMarkup();
    }

    const hero = root.querySelector(".provider-compare-hero");
    const details = root.querySelector("[data-phase8b-movie-details]");
    const versionRail = root.querySelector("[data-phase8a-version-rail]");
    const anchor = versionRail || details || hero;
    if (anchor && anchor.nextElementSibling !== nav) {
      anchor.insertAdjacentElement("afterend", nav);
    }
    return nav;
  }

  function setShown(element, shown) {
    element?.classList.toggle(HIDDEN_CLASS, !shown);
  }

  function ensureRecommendationsExpanded(section) {
    const recommendations = section?.querySelector("[data-provider-recommendations]");
    if (!recommendations) return;
    if (!recommendations.hidden) return;

    const toggle = section.querySelector("[data-phase8b-recommendation-toggle]");
    toggle?.click();
    recommendations.hidden = false;
  }

  function applyPivotState(root, nav) {
    const section = root.querySelector(".phase8b-timeline-section");
    if (!section || !nav) return;

    if (activePivot === "picks") ensureRecommendationsExpanded(section);

    const dateSection = section.querySelector(".phase8b-date-section");
    const filterSection = section.querySelector(".phase8b-filter-section");
    const recommendationToggle = section.querySelector("[data-phase8b-recommendation-toggle]");
    const recommendations = section.querySelector("[data-provider-recommendations]");
    const showtimeHeading = section.querySelector(".phase8b-showtime-heading");
    const result = section.querySelector("[data-insight-result]");
    const timeline = section.querySelector(".provider-compare-timeline");
    const note = section.querySelector(".provider-compare-note");
    const empty = section.querySelector(".provider-compare-empty");

    const showShowtimes = activePivot === "showtimes";
    const showPicks = activePivot === "picks";
    const showFilters = activePivot === "filters";

    setShown(dateSection, showShowtimes);
    setShown(filterSection, showFilters);
    setShown(recommendationToggle, false);
    setShown(recommendations, showPicks);
    setShown(showtimeHeading, showShowtimes);
    setShown(result, showShowtimes);
    setShown(timeline, showShowtimes);
    setShown(note, showShowtimes);
    setShown(empty, showShowtimes);

    root.dataset.metroComparisonPivot = activePivot;
    section.dataset.metroComparisonPivot = activePivot;

    nav.querySelectorAll("[data-metro-comparison-pivot-tab]").forEach(button => {
      const selected = button.dataset.metroComparisonPivotTab === activePivot;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.classList.toggle("active", selected);
    });
  }

  function decorateShell(root) {
    const close = document.querySelector("#providerCompareOverlay .provider-compare-close");
    if (close) {
      if (close.textContent !== "←") close.textContent = "←";
      close.setAttribute("aria-label", "返回電影列表");
      close.title = "返回";
    }

    const hero = root.querySelector(".provider-compare-hero");
    hero?.classList.add("metro-comparison-panorama");
  }

  function apply() {
    scheduled = false;
    if (applying) return;
    const root = document.querySelector("#providerCompareContent");
    if (!root) return;

    applying = true;
    try {
      resetForComparison();
      decorateShell(root);
      const nav = ensurePivot(root);
      applyPivotState(root, nav);
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function setPivot(key, options = {}) {
    if (!PIVOTS.some(pivot => pivot.key === key)) return false;
    activePivot = key;
    apply();

    if (options.focus) {
      document.querySelector(`[data-metro-comparison-pivot-tab="${key}"]`)?.focus();
    }

    window.dispatchEvent(new CustomEvent("hkcinema:metro-comparison-pivot", {
      detail: { key, comparisonId: activeComparisonId }
    }));
    return true;
  }

  function movePivot(currentKey, direction) {
    const currentIndex = PIVOTS.findIndex(pivot => pivot.key === currentKey);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + direction + PIVOTS.length) % PIVOTS.length;
    setPivot(PIVOTS[nextIndex].key, { focus: true });
  }

  function handleClick(event) {
    const button = event.target.closest?.("[data-metro-comparison-pivot-tab]");
    if (!button) return;
    event.preventDefault();
    setPivot(button.dataset.metroComparisonPivotTab);
  }

  function handleKeydown(event) {
    const button = event.target.closest?.("[data-metro-comparison-pivot-tab]");
    if (!button) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      movePivot(button.dataset.metroComparisonPivotTab, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      movePivot(button.dataset.metroComparisonPivotTab, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setPivot(PIVOTS[0].key, { focus: true });
    } else if (event.key === "End") {
      event.preventDefault();
      setPivot(PIVOTS[PIVOTS.length - 1].key, { focus: true });
    }
  }

  function install() {
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeydown, true);
    window.addEventListener("hkcinema:provider-compare-open", schedule);
    window.addEventListener("hkcinema:provider-compare-lifecycle", schedule);
    window.addEventListener("hkcinema:compare-seat-summary", schedule);

    const observer = new MutationObserver(records => {
      if (applying) return;
      const relevant = records.some(record => {
        const target = record.target?.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target?.parentElement;
        if (!target?.closest?.("#providerCompareContent")) return false;
        return !target.closest?.("[data-metro-comparison-pivot]");
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  }

  window.HKCinemaMetroComparison = Object.freeze({
    version: "10b1",
    refresh: schedule,
    setPivot,
    getState() {
      return { activePivot, activeComparisonId };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
