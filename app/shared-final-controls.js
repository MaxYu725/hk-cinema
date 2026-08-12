(() => {
  const TAB_KEYS = ["now", "coming"];
  const tabCounts = new Map();
  let observer = null;
  let syncQueued = false;

  function titleOf(movie) {
    return movie?.title?.zh || movie?.title?.en || movie?.title || "";
  }

  function catalogueMovies(tab) {
    const broadway = window.HKCinemaBroadwayApp?.getCatalogue?.() || {};
    const mcl = window.HKCinemaMCLCatalogue || {};
    const emperor = window.HKCinemaEmperorCatalogue || {};
    const broadwayMovies = tab === "now"
      ? (broadway.now || []).filter(movie => !movie?.status || movie.status === "now-showing")
      : (broadway.coming || []);
    return [
      ...broadwayMovies,
      ...(mcl?.[tab] || []),
      ...(emperor?.[tab] || [])
    ];
  }

  function combinedMovieCount(tab) {
    const core = window.HKCinemaHomeDiscoveryCore;
    const movies = catalogueMovies(tab);
    if (!core || !movies.length) return null;

    const exact = new Map();
    for (const movie of movies) {
      const title = titleOf(movie);
      const normalized = core.normalizeTitle?.(title) || String(title).normalize("NFKC").toLowerCase().trim();
      if (!normalized || exact.has(normalized)) continue;
      const parsed = core.parseVariantTitle?.(title) || { key: normalized, hasVariant: false };
      exact.set(normalized, { title, parsed });
    }

    const groups = new Map();
    for (const entry of exact.values()) {
      const key = entry.parsed?.key || core.normalizeTitle?.(entry.title) || entry.title;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }

    let total = 0;
    for (const entries of groups.values()) {
      total += entries.length > 1 && entries.some(entry => entry.parsed?.hasVariant)
        ? 1
        : entries.length;
    }
    return total;
  }

  function currentRenderedTotal() {
    const count = document.querySelector("#movieCount");
    const titleMatch = count?.title?.match(/合併版本後\s*(\d+)\s*部/);
    if (titleMatch) return Number(titleMatch[1]);
    const textMatch = count?.textContent?.match(/(\d+)\s*部/);
    return textMatch ? Number(textMatch[1]) : null;
  }

  function ensureTabCount(tab) {
    const button = document.querySelector(`[data-tab="${tab}"]`);
    if (!button) return null;
    let badge = button.querySelector(`[data-classic-final-tab-count="${tab}"]`);
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "classic-final-tab-count shared-final-tab-count";
      badge.dataset.classicFinalTabCount = tab;
      badge.dataset.sharedFinalTabCount = tab;
      badge.setAttribute("aria-hidden", "true");
      button.appendChild(badge);
    }
    return badge;
  }

  function syncTabCounts() {
    const activeTab = document.querySelector(".tab.active")?.dataset.tab || "now";
    const rendered = currentRenderedTotal();
    if (Number.isFinite(rendered)) tabCounts.set(activeTab, rendered);

    for (const tab of TAB_KEYS) {
      const calculated = combinedMovieCount(tab);
      if (Number.isFinite(calculated)) tabCounts.set(tab, calculated);
      const badge = ensureTabCount(tab);
      if (!badge) continue;
      const value = tabCounts.get(tab);
      const text = Number.isFinite(value) ? `${value}` : "—";
      if (badge.textContent !== text) badge.textContent = text;
      const button = badge.closest(".tab");
      if (button) {
        const label = tab === "now" ? "現正上映" : "即將上映";
        const ariaLabel = Number.isFinite(value) ? `${label}，${value} 部` : label;
        if (button.getAttribute("aria-label") !== ariaLabel) button.setAttribute("aria-label", ariaLabel);
      }
    }
  }

  function ensureSortControl() {
    const heading = document.querySelector("#providerCompareContent .phase8b-showtime-heading");
    const headingMain = heading?.querySelector(":scope > div");
    if (!headingMain) return;

    let control = headingMain.querySelector("[data-shared-final-sort], [data-classic-final-sort]");
    if (!control) {
      control = document.createElement("label");
      control.className = "classic-final-sort shared-final-sort";
      control.dataset.classicFinalSort = "true";
      control.dataset.sharedFinalSort = "true";
      control.innerHTML = `
        <span>排序</span>
        <select data-classic-final-sort-select data-shared-final-sort-select aria-label="場次排序">
          <option value="time">時間</option>
          <option value="price">價格</option>
          <option value="seats">座位</option>
        </select>
      `;
      headingMain.appendChild(control);
      control.querySelector("select")?.addEventListener("change", event => {
        window.HKCinemaProviderCompareFilters?.setFilter?.("sort", event.target.value || "time");
      });
    } else {
      control.classList.add("shared-final-sort");
      control.dataset.sharedFinalSort = "true";
      control.querySelector("select")?.setAttribute("data-shared-final-sort-select", "");
    }

    const select = control.querySelector("select");
    const value = window.HKCinemaProviderCompareFilters?.getState?.().sort || "time";
    if (select && select.value !== value) select.value = value;
  }

  function syncComparison() {
    ensureSortControl();
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncTabCounts();
      syncComparison();
    });
  }

  function install() {
    syncTabCounts();
    syncComparison();

    window.addEventListener("hkcinema:home-tab", scheduleSync);
    window.addEventListener("hkcinema:mcl-catalogue", scheduleSync);
    window.addEventListener("hkcinema:emperor-catalogue", scheduleSync);
    window.addEventListener("hkcinema:provider-matches", scheduleSync);
    window.addEventListener("hkcinema:data-health", scheduleSync);
    window.addEventListener("hkcinema:provider-compare-open", scheduleSync);
    window.addEventListener("hkcinema:provider-compare-lifecycle", scheduleSync);
    window.addEventListener("hkcinema:compare-seat-summary", scheduleSync);

    observer = new MutationObserver(records => {
      if (!records.some(record => {
        const target = record.target?.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target?.parentElement;
        return target?.closest?.("#movieCount, #movieGrid, #providerCompareContent") ||
          Array.from(record.addedNodes || []).some(node => node?.nodeType === Node.ELEMENT_NODE && (
            node.matches?.("#providerCompareOverlay") ||
            node.querySelector?.("#providerCompareOverlay")
          ));
      })) return;
      scheduleSync();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.HKCinemaSharedFinalControls = Object.freeze({
    version: "m7f-1",
    refresh: scheduleSync,
    ensureSortControl,
    getTabCounts() { return Object.fromEntries(tabCounts); }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
