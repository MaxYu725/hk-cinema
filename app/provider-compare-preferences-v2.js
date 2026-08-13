(() => {
  const sharedCore = window.HKCinemaProviderSharedCore || null;
  const STORAGE_KEY = "hkcinema:provider-compare-filters:v2";
  const DEFAULTS = {
    provider: "all",
    language: "all",
    subtitle: "all",
    format: "all",
    region: "all",
    district: "all",
    cinema: "all",
    period: "all",
    price: "all",
    seats: "all",
    sort: "time"
  };
  const ALLOWED = {
    region: new Set(["all", "hk", "kln", "nt-islands"]),
    period: new Set(["all", "morning", "afternoon", "evening", "next2h"]),
    seats: new Set(["all", "known", "available", "roomy"]),
    sort: new Set(["time", "price", "seats"])
  };

  let restoring = false;
  let restoredForOpen = false;
  let overlayObserver = null;
  let contentObserver = null;
  let restoreToken = 0;

  function filtersApi() {
    return window.HKCinemaProviderCompareFilters || null;
  }

  function providerValue(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw || raw === "all") return DEFAULTS.provider;
    return sharedCore?.registeredProviderId?.(raw) || DEFAULTS.provider;
  }

  function metadataValue(input, key) {
    return typeof input[key] === "string" && /^(?:all|[a-z0-9-]+)$/.test(input[key]) ? input[key] : DEFAULTS[key];
  }

  function sanitize(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      provider: providerValue(input.provider),
      language: metadataValue(input, "language"),
      subtitle: metadataValue(input, "subtitle"),
      format: metadataValue(input, "format"),
      region: ALLOWED.region.has(input.region) ? input.region : DEFAULTS.region,
      district: typeof input.district === "string" && input.district ? input.district.slice(0, 80) : DEFAULTS.district,
      cinema: typeof input.cinema === "string" && input.cinema ? input.cinema : DEFAULTS.cinema,
      period: ALLOWED.period.has(input.period) ? input.period : DEFAULTS.period,
      price: typeof input.price === "string" && /^(?:all|lte-\d{1,4})$/.test(input.price) ? input.price : DEFAULTS.price,
      seats: ALLOWED.seats.has(input.seats) ? input.seats : DEFAULTS.seats,
      sort: ALLOWED.sort.has(input.sort) ? input.sort : DEFAULTS.sort
    };
  }

  function readSaved() {
    try { return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")); }
    catch { return { ...DEFAULTS }; }
  }

  function writeSaved(state = null) {
    if (restoring || !restoredForOpen) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitize(state || filtersApi()?.getState?.() || DEFAULTS))); }
    catch { /* restricted storage */ }
  }

  function controlsReady() {
    const content = document.querySelector("#providerCompareContent");
    return Boolean(content?.querySelector("[data-insight-provider]") && content?.querySelector("[data-insight-sort]") && filtersApi()?.setFilter);
  }

  function restoreSavedFilters() {
    const overlay = document.querySelector("#providerCompareOverlay");
    if (!overlay || overlay.hidden || restoredForOpen) return;
    const token = ++restoreToken;
    let attempts = 0;

    const tryRestore = () => {
      if (token !== restoreToken) return;
      const currentOverlay = document.querySelector("#providerCompareOverlay");
      if (!currentOverlay || currentOverlay.hidden) return;
      if (!controlsReady()) {
        attempts += 1;
        if (attempts < 90) requestAnimationFrame(tryRestore);
        return;
      }

      restoring = true;
      try {
        const saved = readSaved();
        for (const key of ["provider", "language", "subtitle", "format", "region", "district", "period", "price", "seats", "sort"]) {
          filtersApi()?.setFilter?.(key, saved[key]);
        }
        filtersApi()?.setCinema?.(saved.cinema);
      } finally {
        restoring = false;
        restoredForOpen = true;
        writeSaved(filtersApi()?.getState?.());
      }
    };
    requestAnimationFrame(tryRestore);
  }

  function resetFilters(button) {
    restoring = true;
    try {
      if (filtersApi()?.reset) filtersApi().reset();
      else {
        for (const [key, value] of Object.entries(DEFAULTS)) {
          if (key === "cinema") filtersApi()?.setCinema?.(value);
          else filtersApi()?.setFilter?.(key, value);
        }
      }
    } finally {
      restoring = false;
      restoredForOpen = true;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS)); } catch { /* ignore */ }
    }

    if (button) {
      const original = button.textContent;
      button.textContent = "已重設";
      button.disabled = true;
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = original;
        button.disabled = false;
      }, 900);
    }
  }

  function observeContent(overlay) {
    contentObserver?.disconnect();
    const content = overlay.querySelector("#providerCompareContent");
    if (!content) return;
    contentObserver = new MutationObserver(() => {
      if (!restoredForOpen || restoring) return;
      queueMicrotask(() => writeSaved());
    });
    contentObserver.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "data-provider", "data-seat-available", "data-seat-total"]
    });
  }

  function attachOverlay(overlay) {
    observeContent(overlay);
    overlayObserver?.disconnect();
    overlayObserver = new MutationObserver(() => {
      if (overlay.hidden) {
        restoreToken += 1;
        restoredForOpen = false;
        return;
      }
      restoreSavedFilters();
    });
    overlayObserver.observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
    if (!overlay.hidden) restoreSavedFilters();
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-provider-compare-reset]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    resetFilters(button);
  }, true);

  function install() {
    const existing = document.querySelector("#providerCompareOverlay");
    if (existing) {
      attachOverlay(existing);
      return;
    }
    const bodyObserver = new MutationObserver(() => {
      const overlay = document.querySelector("#providerCompareOverlay");
      if (!overlay) return;
      bodyObserver.disconnect();
      attachOverlay(overlay);
    });
    bodyObserver.observe(document.body, { childList: true, subtree: false });
  }

  window.HKCinemaProviderComparePreferences = Object.freeze({
    version: "5e1-m7r4-1",
    sanitize,
    readSaved
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();