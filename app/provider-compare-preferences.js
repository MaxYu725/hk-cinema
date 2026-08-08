(() => {
  const STORAGE_KEY = "hkcinema:provider-compare-filters:v1";
  const DEFAULTS = {
    provider: "all",
    region: "all",
    cinema: "all",
    period: "all",
    sort: "time"
  };

  const ALLOWED = {
    provider: new Set(["all", "broadway", "mcl", "emperor"]),
    region: new Set(["all", "hk", "kln", "nt-islands"]),
    period: new Set(["all", "morning", "afternoon", "evening"]),
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

  function sanitize(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      provider: ALLOWED.provider.has(input.provider) ? input.provider : DEFAULTS.provider,
      region: ALLOWED.region.has(input.region) ? input.region : DEFAULTS.region,
      cinema: typeof input.cinema === "string" && input.cinema ? input.cinema : DEFAULTS.cinema,
      period: ALLOWED.period.has(input.period) ? input.period : DEFAULTS.period,
      sort: ALLOWED.sort.has(input.sort) ? input.sort : DEFAULTS.sort
    };
  }

  function readSaved() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return { ...DEFAULTS };
    }
  }

  function writeSaved(state = null) {
    if (restoring || !restoredForOpen) return;
    const current = sanitize(state || filtersApi()?.getState?.() || DEFAULTS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Storage may be unavailable in private browsing.
    }
  }

  function clickFilterButton(attribute, value) {
    const selector = `[${attribute}="${CSS.escape(value)}"]`;
    const button = document.querySelector(`#providerCompareContent ${selector}`);
    if (!button || button.classList.contains("active")) return;
    button.click();
  }

  function controlsReady() {
    const content = document.querySelector("#providerCompareContent");
    return Boolean(
      content?.querySelector("[data-insight-provider]") &&
      content?.querySelector("[data-insight-region]") &&
      content?.querySelector("[data-insight-period]") &&
      content?.querySelector("[data-insight-sort]")
    );
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

      if (!controlsReady() || !filtersApi()?.setCinema) {
        attempts += 1;
        if (attempts < 90) requestAnimationFrame(tryRestore);
        return;
      }

      restoring = true;
      try {
        const saved = readSaved();
        clickFilterButton("data-insight-provider", saved.provider);
        clickFilterButton("data-insight-region", saved.region);
        clickFilterButton("data-insight-period", saved.period);
        clickFilterButton("data-insight-sort", saved.sort);
        filtersApi().setCinema(saved.cinema);
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
      clickFilterButton("data-insight-provider", DEFAULTS.provider);
      clickFilterButton("data-insight-region", DEFAULTS.region);
      clickFilterButton("data-insight-period", DEFAULTS.period);
      clickFilterButton("data-insight-sort", DEFAULTS.sort);
      filtersApi()?.setCinema?.(DEFAULTS.cinema);
    } finally {
      restoring = false;
      restoredForOpen = true;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS));
      } catch {
        // Ignore storage failures.
      }
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

  function ensureResetButton(overlay) {
    const sheet = overlay?.querySelector(".provider-compare-sheet");
    if (!sheet || sheet.querySelector("[data-provider-compare-reset]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "provider-compare-reset";
    button.dataset.providerCompareReset = "true";
    button.textContent = "重設篩選";
    button.setAttribute("aria-label", "重設比較篩選");
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetFilters(button);
    });

    sheet.appendChild(button);
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
      attributeFilter: ["class", "hidden", "data-seat-available", "data-seat-total"]
    });
  }

  function attachOverlay(overlay) {
    ensureResetButton(overlay);
    observeContent(overlay);

    overlayObserver?.disconnect();
    overlayObserver = new MutationObserver(() => {
      if (overlay.hidden) {
        restoreToken += 1;
        restoredForOpen = false;
        return;
      }
      ensureResetButton(overlay);
      restoreSavedFilters();
    });

    overlayObserver.observe(overlay, {
      attributes: true,
      attributeFilter: ["hidden"]
    });

    if (!overlay.hidden) restoreSavedFilters();
  }

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();