(() => {
  const OVERLAY_ID = "providerCompareOverlay";
  const PORTAL_ID = "providerCompareCinemaPortal";
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "select:not([disabled])",
    "input:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  let currentOverlay = null;
  let overlayObserver = null;
  let contentObserver = null;
  let lastOpener = null;
  let restoreScrollY = 0;
  let backgroundSnapshot = null;
  let isOpen = false;
  let enhanceScheduled = false;

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function appShell() {
    return document.querySelector(".app-shell");
  }

  function saveAndHideBackground() {
    const shell = appShell();
    if (!shell || backgroundSnapshot) return;

    backgroundSnapshot = {
      shell,
      hadInert: shell.hasAttribute("inert"),
      ariaHidden: shell.getAttribute("aria-hidden")
    };

    shell.setAttribute("inert", "");
    shell.setAttribute("aria-hidden", "true");
  }

  function restoreBackground() {
    const snapshot = backgroundSnapshot;
    backgroundSnapshot = null;
    if (!snapshot?.shell?.isConnected) return;

    if (!snapshot.hadInert) {
      snapshot.shell.removeAttribute("inert");
    }

    if (snapshot.ariaHidden === null) {
      snapshot.shell.removeAttribute("aria-hidden");
    } else {
      snapshot.shell.setAttribute("aria-hidden", snapshot.ariaHidden);
    }
  }

  function focusables(overlay) {
    const sheet = overlay?.querySelector(".provider-compare-sheet");
    const portal = document.querySelector(`#${PORTAL_ID}`);
    const candidates = [
      ...(sheet ? sheet.querySelectorAll(FOCUSABLE_SELECTOR) : []),
      ...(portal ? portal.querySelectorAll(FOCUSABLE_SELECTOR) : [])
    ];

    return candidates.filter(element =>
      visible(element) &&
      element.getAttribute("aria-hidden") !== "true"
    );
  }

  function focusInitial(overlay) {
    requestAnimationFrame(() => {
      if (!isOpen || overlay.hidden) return;
      const closeButton = overlay.querySelector("[data-provider-compare-close]");
      const sheet = overlay.querySelector(".provider-compare-sheet");
      (closeButton || sheet)?.focus?.({ preventScroll: true });
    });
  }

  function openOverlay(overlay) {
    if (isOpen) {
      enhanceAria();
      return;
    }

    isOpen = true;
    restoreScrollY = window.scrollY;
    overlay.setAttribute("aria-hidden", "false");
    saveAndHideBackground();

    const sheet = overlay.querySelector(".provider-compare-sheet");
    if (sheet && !sheet.hasAttribute("tabindex")) {
      sheet.tabIndex = -1;
    }

    enhanceAria();
    focusInitial(overlay);
  }

  function closeOverlay(overlay) {
    if (!isOpen) {
      overlay?.setAttribute("aria-hidden", "true");
      restoreBackground();
      return;
    }

    isOpen = false;
    overlay?.setAttribute("aria-hidden", "true");
    restoreBackground();

    const target = lastOpener;
    lastOpener = null;
    const y = restoreScrollY;

    requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - y) > 1) {
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
      }

      if (target?.isConnected && typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }
    });
  }

  function setPressed(selector) {
    document.querySelectorAll(`#${OVERLAY_ID} ${selector}`).forEach(button => {
      button.setAttribute(
        "aria-pressed",
        button.classList.contains("active") ? "true" : "false"
      );
    });
  }

  function cleanLegacyCopy(content) {
    const note = content?.querySelector(".provider-compare-note");
    if (!note) return;

    const legacy = "最便宜、最快及座位比較會在 Phase 5C 加入。";
    if (note.textContent.includes(legacy)) {
      note.textContent = note.textContent.replace(
        legacy,
        "摘要、推薦及座位比較會按目前已取得的資料自動更新。"
      );
    }
  }

  function enhanceAriaNow() {
    enhanceScheduled = false;
    const overlay = currentOverlay || document.querySelector(`#${OVERLAY_ID}`);
    if (!overlay) return;

    const content = overlay.querySelector("#providerCompareContent");
    const loading = Boolean(content?.querySelector(".provider-compare-loading"));

    if (content) {
      content.setAttribute("aria-busy", loading ? "true" : "false");
    }

    overlay.querySelectorAll(".provider-compare-loading").forEach(element => {
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
      element.setAttribute("aria-atomic", "true");
    });

    overlay.querySelectorAll(".provider-compare-empty").forEach(element => {
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
      element.setAttribute("aria-atomic", "true");
    });

    overlay.querySelectorAll(".provider-compare-warning").forEach(element => {
      element.setAttribute("role", "alert");
      element.setAttribute("aria-live", "assertive");
    });

    const resilience = overlay.querySelector("[data-provider-resilience]");
    if (resilience) {
      resilience.setAttribute(
        "role",
        overlay.dataset.compareDataState === "error" ? "alert" : "status"
      );
      resilience.setAttribute(
        "aria-live",
        overlay.dataset.compareDataState === "error" ? "assertive" : "polite"
      );
      resilience.setAttribute("aria-atomic", "true");
    }

    const dates = overlay.querySelector(".provider-compare-dates");
    dates?.setAttribute("aria-label", "選擇可售日期");
    overlay.querySelectorAll("[data-provider-compare-date]").forEach(button => {
      button.setAttribute(
        "aria-pressed",
        button.classList.contains("active") ? "true" : "false"
      );
    });

    setPressed("[data-insight-provider]");
    setPressed("[data-insight-region]");
    setPressed("[data-insight-period]");
    setPressed("[data-insight-sort]");

    const cinemaSelect = overlay.querySelector("select[data-insight-cinema]");
    if (cinemaSelect) {
      cinemaSelect.setAttribute("aria-haspopup", "listbox");
      cinemaSelect.setAttribute("aria-controls", PORTAL_ID);
    }

    cleanLegacyCopy(content);
  }

  function enhanceAria() {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    requestAnimationFrame(enhanceAriaNow);
  }

  function observeContent(overlay) {
    contentObserver?.disconnect();
    contentObserver = null;

    const content = overlay.querySelector("#providerCompareContent");
    if (!content) return;

    contentObserver = new MutationObserver(enhanceAria);
    contentObserver.observe(content, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function attachOverlay(overlay) {
    if (!overlay || overlay === currentOverlay) return;

    overlayObserver?.disconnect();
    contentObserver?.disconnect();
    currentOverlay = overlay;

    overlay.setAttribute("aria-hidden", overlay.hidden ? "true" : "false");
    observeContent(overlay);

    overlayObserver = new MutationObserver(records => {
      const hiddenChanged = records.some(record =>
        record.type === "attributes" && record.attributeName === "hidden"
      );
      if (!hiddenChanged) return;

      if (overlay.hidden) {
        closeOverlay(overlay);
      } else {
        openOverlay(overlay);
      }
    });

    overlayObserver.observe(overlay, {
      attributes: true,
      attributeFilter: ["hidden"]
    });

    if (!overlay.hidden) openOverlay(overlay);
    enhanceAria();
  }

  function installOverlayWatcher() {
    const existing = document.querySelector(`#${OVERLAY_ID}`);
    if (existing) attachOverlay(existing);

    const observer = new MutationObserver(() => {
      const overlay = document.querySelector(`#${OVERLAY_ID}`);
      if (overlay && overlay !== currentOverlay) attachOverlay(overlay);
    });

    observer.observe(document.body, { childList: true });
  }

  document.addEventListener("pointerdown", event => {
    const opener = event.target.closest?.("[data-compare-open]");
    if (opener) lastOpener = opener;
  }, true);

  document.addEventListener("keydown", event => {
    const opener = event.target.closest?.("[data-compare-open]");
    if (opener && (event.key === "Enter" || event.key === " ")) {
      lastOpener = opener;
    }

    const overlay = currentOverlay;
    if (event.key !== "Tab" || !overlay || overlay.hidden || !isOpen) return;

    const items = focusables(overlay);
    if (!items.length) {
      event.preventDefault();
      overlay.querySelector(".provider-compare-sheet")?.focus?.();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const activeIndex = items.indexOf(active);

    if (event.shiftKey) {
      if (activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (activeIndex === -1 || active === last) {
      event.preventDefault();
      first.focus();
    }
  }, true);

  window.addEventListener("hkcinema:provider-compare-lifecycle", enhanceAria);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installOverlayWatcher, { once: true });
  } else {
    installOverlayWatcher();
  }
})();
