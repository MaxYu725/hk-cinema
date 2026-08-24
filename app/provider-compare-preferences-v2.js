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

  function restoreSavedFilters() {
    restoring = true;
    try {
      const saved = readSaved();
      if (filtersApi()?.setFilters) filtersApi().setFilters(saved);
      else {
        for (const [key, value] of Object.entries(saved)) {
          if (key === "cinema") filtersApi()?.setCinema?.(value);
          else filtersApi()?.setFilter?.(key, value);
        }
      }
      restoredForOpen = true;
    } finally {
      restoring = false;
    }
    writeSaved(filtersApi()?.getState?.());
  }

  function resetFilters(button) {
    restoring = true;
    try {
      filtersApi()?.reset?.();
      restoredForOpen = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
    } catch { /* restricted storage */ }
    finally { restoring = false; }

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

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-provider-compare-reset]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    resetFilters(button);
  }, true);

  window.addEventListener("hkcinema:provider-compare-open", () => {
    restoredForOpen = false;
    restoreSavedFilters();
  });

  window.addEventListener("hkcinema:comparison-store-change", event => {
    if (event.detail?.matchId === null) {
      restoredForOpen = false;
      return;
    }
    if (!restoring && restoredForOpen && String(event.detail?.reason || "").startsWith("filter")) {
      queueMicrotask(() => writeSaved());
    }
  });

  window.HKCinemaProviderComparePreferences = Object.freeze({
    version: "c4-1",
    sanitize,
    readSaved,
    restore: restoreSavedFilters
  });
})();
