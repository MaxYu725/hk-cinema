(() => {
  const INTERACTION_SELECTOR = [
    "[data-provider-filter-toggle]",
    "[data-provider-compare-reset]",
    "[data-insight-clear-filter]",
    "[data-insight-provider]",
    "[data-insight-language]",
    "[data-insight-subtitle]",
    "[data-insight-format]",
    "[data-insight-region]",
    "[data-insight-district]",
    "[data-insight-period]",
    "[data-insight-price]",
    "[data-insight-seats]",
    "[data-insight-sort]",
    "[data-insight-cinema]"
  ].join(",");

  const LOCATOR_ATTRIBUTES = [
    "data-provider-filter-toggle",
    "data-provider-compare-reset",
    "data-insight-clear-filter",
    "data-insight-provider",
    "data-insight-language",
    "data-insight-subtitle",
    "data-insight-format",
    "data-insight-region",
    "data-insight-district",
    "data-insight-period",
    "data-insight-price",
    "data-insight-seats",
    "data-insight-sort",
    "data-insight-cinema"
  ];

  let restoreToken = 0;
  let pointerSnapshot = null;

  function escapeAttribute(value) {
    return String(value ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"');
  }

  function controlForEvent(event) {
    return event.target?.closest?.(INTERACTION_SELECTOR) || null;
  }

  function sheetFor(control) {
    const overlay = control?.closest?.("#providerCompareOverlay") || document.querySelector("#providerCompareOverlay");
    if (!overlay || overlay.hidden) return null;
    return overlay.querySelector(".provider-compare-sheet");
  }

  function locatorFor(control) {
    if (!control) return null;
    for (const attribute of LOCATOR_ATTRIBUTES) {
      if (!control.hasAttribute(attribute)) continue;
      const value = control.getAttribute(attribute);
      return value === "" || value === null
        ? `[${attribute}]`
        : `[${attribute}="${escapeAttribute(value)}"]`;
    }
    return null;
  }

  function currentComparisonId() {
    return window.HKCinemaProviderCompare?.getState?.()?.match?.id || null;
  }

  function capture(control) {
    const sheet = sheetFor(control);
    if (!sheet) return null;
    const sheetRect = sheet.getBoundingClientRect();
    const controlRect = control.getBoundingClientRect();
    return {
      sheet,
      comparisonId: currentComparisonId(),
      scrollTop: sheet.scrollTop,
      locator: locatorFor(control),
      anchorOffset: controlRect.top - sheetRect.top
    };
  }

  function restore(snapshot) {
    const sheet = snapshot?.sheet;
    if (!sheet?.isConnected) return;
    if (snapshot.comparisonId && currentComparisonId() !== snapshot.comparisonId) return;

    sheet.scrollTop = snapshot.scrollTop;

    if (!snapshot.locator) return;
    let anchor = null;
    try {
      anchor = sheet.querySelector(snapshot.locator);
    } catch {
      anchor = null;
    }
    if (!anchor || anchor.getClientRects().length === 0) return;

    const sheetRect = sheet.getBoundingClientRect();
    const currentOffset = anchor.getBoundingClientRect().top - sheetRect.top;
    const delta = currentOffset - snapshot.anchorOffset;
    if (Math.abs(delta) >= 0.5) sheet.scrollTop += delta;
  }

  function scheduleRestore(snapshot) {
    if (!snapshot) return;
    const token = ++restoreToken;

    queueMicrotask(() => {
      if (token !== restoreToken) return;
      restore(snapshot);

      requestAnimationFrame(() => {
        if (token !== restoreToken) return;
        restore(snapshot);

        requestAnimationFrame(() => {
          if (token !== restoreToken) return;
          restore(snapshot);
        });
      });
    });
  }

  window.addEventListener("pointerdown", event => {
    const control = controlForEvent(event);
    pointerSnapshot = control
      ? { control, snapshot: capture(control) }
      : null;
  }, true);

  window.addEventListener("click", event => {
    const control = controlForEvent(event);
    if (!control) {
      pointerSnapshot = null;
      return;
    }

    const snapshot = pointerSnapshot?.control === control
      ? pointerSnapshot.snapshot
      : capture(control);
    pointerSnapshot = null;
    scheduleRestore(snapshot);
  }, true);

  window.addEventListener("change", event => {
    const control = controlForEvent(event);
    if (!control) return;
    scheduleRestore(capture(control));
  }, true);

  window.HKCinemaFilterScrollStability = Object.freeze({
    version: "8d1",
    capture,
    restore
  });
})();
