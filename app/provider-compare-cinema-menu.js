(() => {
  const SELECTOR = "select[data-insight-cinema]";
  const PORTAL_ID = "providerCompareCinemaPortal";

  let activeSelect = null;
  let suppressClickUntil = 0;

  function getPortal() {
    return document.querySelector(`#${PORTAL_ID}`);
  }

  function closePortal() {
    getPortal()?.remove();
    activeSelect = null;
  }

  function optionLabel(option) {
    return option?.textContent?.replace(/\s+/g, " ")?.trim() || option?.value || "戲院";
  }

  function positionPortal(portal, select) {
    const rect = select.getBoundingClientRect();
    const gap = 6;
    const edge = 10;
    const below = window.innerHeight - rect.bottom - edge - gap;
    const above = rect.top - edge - gap;
    const useBelow = below >= 180 || below >= above;
    const maxHeight = Math.max(140, Math.min(360, useBelow ? below : above));

    portal.style.left = `${Math.max(edge, rect.left)}px`;
    portal.style.width = `${Math.max(220, Math.min(rect.width, window.innerWidth - edge * 2))}px`;
    portal.style.maxHeight = `${maxHeight}px`;

    if (useBelow) {
      portal.style.top = `${Math.min(window.innerHeight - edge, rect.bottom + gap)}px`;
      portal.style.bottom = "auto";
    } else {
      portal.style.top = "auto";
      portal.style.bottom = `${Math.max(edge, window.innerHeight - rect.top + gap)}px`;
    }
  }

  function openPortal(select) {
    if (!select || !select.isConnected || select.options.length <= 1) return;

    if (activeSelect === select && getPortal()) {
      closePortal();
      return;
    }

    closePortal();
    activeSelect = select;

    const portal = document.createElement("div");
    portal.id = PORTAL_ID;
    portal.className = "provider-compare-cinema-portal";
    portal.setAttribute("role", "listbox");
    portal.setAttribute("aria-label", "選擇戲院");

    for (const option of Array.from(select.options)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "provider-compare-cinema-portal-option";
      button.dataset.cinemaPortalValue = option.value;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", option.selected ? "true" : "false");
      button.textContent = optionLabel(option);

      if (option.selected) {
        button.classList.add("active");
      }

      portal.appendChild(button);
    }

    document.body.appendChild(portal);
    positionPortal(portal, select);

    requestAnimationFrame(() => {
      portal.querySelector(".active")?.scrollIntoView({
        block: "nearest",
        inline: "nearest"
      });
    });
  }

  function applySelection(value) {
    const selectTarget = activeSelect;
    if (!selectTarget?.isConnected) {
      closePortal();
      return false;
    }

    const nextValue = value || "all";
    const optionExists = Array.from(selectTarget.options)
      .some(option => option.value === nextValue);

    if (!optionExists) {
      closePortal();
      return false;
    }

    selectTarget.value = nextValue;

    // The comparison module owns the actual filter state and listens to
    // change. Dispatch synchronously while the current select is still in
    // the live comparison DOM; enhance() may replace it immediately.
    selectTarget.dispatchEvent(new Event("input", { bubbles: true }));
    selectTarget.dispatchEvent(new Event("change", { bubbles: true }));

    suppressClickUntil = performance.now() + 700;
    closePortal();
    return true;
  }

  document.addEventListener("pointerdown", event => {
    const select = event.target.closest?.(SELECTOR);

    if (select) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openPortal(select);
      return;
    }

    const option = event.target.closest?.("[data-cinema-portal-value]");
    if (option) {
      // Mobile browsers have repeatedly suppressed the later pointerup/click
      // inside this overlay. pointerdown is the one event confirmed to reach
      // the option (the pressed highlight is visible), so apply immediately.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      applySelection(option.dataset.cinemaPortalValue || "all");
      return;
    }

    if (getPortal() && !event.target.closest?.(`#${PORTAL_ID}`)) {
      closePortal();
    }
  }, true);

  document.addEventListener("click", event => {
    const select = event.target.closest?.(SELECTOR);
    if (select) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    const option = event.target.closest?.("[data-cinema-portal-value]");
    if (!option) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (performance.now() < suppressClickUntil) return;

    // Keyboard / desktop fallback.
    applySelection(option.dataset.cinemaPortalValue || "all");
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !getPortal()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closePortal();
  }, true);

  window.addEventListener("resize", closePortal, { passive: true });
  window.addEventListener("orientationchange", closePortal, { passive: true });

  document.addEventListener("scroll", event => {
    if (!getPortal()) return;
    if (event.target?.closest?.(`#${PORTAL_ID}`)) return;
    closePortal();
  }, true);
})();