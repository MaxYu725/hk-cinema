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
    if (label && label.textContent !== "排序：") label.textContent = "排序：";
  }

  function moveDataHealthIntoControls() {
    const panel = document.querySelector("#dataHealth");
    const controls = document.querySelector(".home-library-filter-options");
    if (!panel || !controls || panel.parentElement === controls) return;
    controls.appendChild(panel);
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
    moveDataHealthIntoControls();
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
      "hkcinema:data-health"
    ].forEach(name => window.addEventListener(name, scheduleSync));

    observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        const target = record.target?.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target?.parentElement;
        if (target?.closest?.("#movieGrid, #homeLibraryTools, #topbarActions, .tabs")) return true;
        return Array.from(record.addedNodes || []).some(node => (
          node?.nodeType === Node.ELEMENT_NODE && (
            node.matches?.("#dataHealth, .movie-card, #homeLibraryTools") ||
            node.querySelector?.("#dataHealth, .movie-card, #homeLibraryTools")
          )
        ));
      });
      if (relevant) scheduleSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.HKCinemaMetro = Object.freeze({
    version: "m1-1",
    refresh: scheduleSync
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
