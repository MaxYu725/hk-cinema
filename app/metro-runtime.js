(() => {
  if (document.documentElement.dataset.skin !== "metro") return;

  let syncQueued = false;
  let observer = null;

  function setMetroThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#000000");
  }

  function syncAppLabel() {
    const eyebrow = document.querySelector(".topbar-brand .eyebrow");
    if (eyebrow && eyebrow.textContent !== "MOVIEMETRO / 電影資訊") {
      eyebrow.textContent = "MOVIEMETRO / 電影資訊";
    }
  }

  function setLeadingText(element, text) {
    if (!element) return;
    const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (!textNode) {
      element.insertBefore(document.createTextNode(text), element.firstChild);
      return;
    }
    if (textNode.textContent !== text) textNode.textContent = text;
  }

  function syncPivotLabels() {
    setLeadingText(document.querySelector('[data-tab="now"]'), "現正在映");
    setLeadingText(document.querySelector('[data-tab="coming"]'), "即將上映");
  }

  function syncSortLabel() {
    const label = document.querySelector(".home-movie-sort > span");
    if (label && label.textContent) label.textContent = "";

    const select = document.querySelector("[data-home-movie-sort]");
    if (!select) return;
    const labels = {
      default: "預設",
      release: "最新上映",
      title: "片名"
    };
    Array.from(select.options || []).forEach(option => {
      const next = labels[option.value];
      if (next && option.textContent !== next) option.textContent = next;
    });
  }

  function syncLegacyStickyState() {
    const tools = document.querySelector("#homeLibraryTools");
    const filters = tools?.querySelector(".home-library-filter-options");
    tools?.classList.remove("is-stuck");

    // Classic sticky code can add `is-stuck` later in the same scroll event.
    // Its mobile rule hides this row, while Metro intentionally keeps all four
    // controls visible. Keep that Metro-only presentation isolated here rather
    // than changing the shared Classic sticky behavior.
    if (filters && filters.style.display !== "grid") filters.style.display = "grid";
  }

  function moveDataHealthIntoControls() {
    const panel = document.querySelector("#dataHealth");
    const controls = document.querySelector(".home-library-filter-options");
    if (!panel || !controls || panel.parentElement === controls) return;
    controls.appendChild(panel);
  }

  function suppressRedundantComparisonLabel(sheet) {
    const status = sheet?.querySelector("#providerCompareContent .provider-compare-status.phase8b-movie-facts");
    if (!status) return;
    const redundant = status.textContent?.trim() === "電影場次比較";
    status.hidden = redundant;
  }

  function syncComparisonShell() {
    const sheet = document.querySelector("#providerCompareOverlay .provider-compare-sheet");
    if (!sheet) return false;

    let nav = sheet.querySelector(":scope > .metro-compare-nav");
    if (!nav) {
      nav = document.createElement("div");
      nav.className = "metro-compare-nav";
      nav.innerHTML = `
        <div class="metro-compare-title">MOVIEMETRO / 場次比較</div>
        <div class="metro-compare-actions"></div>
      `;
      sheet.insertBefore(nav, sheet.firstChild);
    }

    const actions = nav.querySelector(".metro-compare-actions");
    const close = sheet.querySelector(".provider-compare-close");
    const health = sheet.querySelector("[data-provider-resilience]");

    if (actions && health && health.parentElement !== actions) actions.appendChild(health);
    if (actions && close && close.parentElement !== actions) actions.appendChild(close);
    if (actions && health && close && health.nextElementSibling !== close) {
      actions.insertBefore(health, close);
    }

    suppressRedundantComparisonLabel(sheet);
    sheet.dataset.metroComparisonShell = "true";
    return true;
  }

  function decorateMovieMetadata() {
    document.querySelectorAll(".movie-card .movie-meta:not([data-metro-decorated])").forEach(meta => {
      const parts = (meta.textContent || "")
        .split("·")
        .map(value => value.trim())
        .filter(Boolean);
      if (!parts.length) {
        meta.dataset.metroDecorated = "true";
        return;
      }

      const fragment = document.createDocumentFragment();
      parts.forEach((part, index) => {
        if (index > 0) {
          const separator = document.createElement("span");
          separator.className = "metro-meta-separator";
          separator.setAttribute("aria-hidden", "true");
          separator.textContent = " · ";
          fragment.appendChild(separator);
        }

        const span = document.createElement("span");
        const isDuration = /分鐘/.test(part);
        const isDate = /^\d{4}-\d{2}-\d{2}$/.test(part);
        span.className = index === 0 && !isDuration && !isDate
          ? "metro-rating-badge"
          : isDate
            ? "metro-release"
            : "metro-duration";
        span.textContent = part;
        fragment.appendChild(span);
      });
      meta.replaceChildren(fragment);
      meta.dataset.metroDecorated = "true";
    });
  }

  function sync() {
    setMetroThemeColor();
    syncAppLabel();
    syncPivotLabels();
    syncSortLabel();
    syncLegacyStickyState();
    moveDataHealthIntoControls();
    syncComparisonShell();
    decorateMovieMetadata();
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      sync();
    });
  }

  function install() {
    sync();

    [
      "hkcinema:home-tab",
      "hkcinema:mcl-catalogue",
      "hkcinema:emperor-catalogue",
      "hkcinema:provider-matches",
      "hkcinema:data-health",
      "hkcinema:provider-compare-open",
      "hkcinema:provider-compare-lifecycle"
    ].forEach(name => window.addEventListener(name, scheduleSync));

    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });

    observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        const target = record.target?.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target?.parentElement;
        if (target?.closest?.("#movieGrid, #homeLibraryTools, #topbarActions, .tabs, #providerCompareOverlay")) return true;
        return Array.from(record.addedNodes || []).some(node => (
          node?.nodeType === Node.ELEMENT_NODE && (
            node.matches?.("#dataHealth, .movie-card, #homeLibraryTools, #providerCompareOverlay, [data-provider-resilience]") ||
            node.querySelector?.("#dataHealth, .movie-card, #homeLibraryTools, #providerCompareOverlay, [data-provider-resilience]")
          )
        ));
      });
      if (relevant) scheduleSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.HKCinemaMetro = Object.freeze({
    version: "m3-2",
    refresh: scheduleSync,
    syncComparisonShell
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
