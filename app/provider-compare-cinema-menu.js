(() => {
  const SELECTOR = "select[data-insight-cinema]";
  const MAX_VISIBLE_OPTIONS = 7;

  function getSelect(target) {
    if (!(target instanceof Element)) return null;
    return target.closest(SELECTOR);
  }

  function isExpanded(select) {
    return select?.dataset?.inlineCinemaExpanded === "true";
  }

  function expand(select) {
    if (!select || select.options.length <= 1 || isExpanded(select)) return;

    const visible = Math.min(
      Math.max(select.options.length, 2),
      MAX_VISIBLE_OPTIONS
    );

    select.dataset.inlineCinemaExpanded = "true";
    select.setAttribute("aria-expanded", "true");
    select.size = visible;

    try {
      select.focus({ preventScroll: true });
    } catch {
      select.focus();
    }
  }

  function collapse(select) {
    if (!select || !isExpanded(select)) return;

    delete select.dataset.inlineCinemaExpanded;
    select.setAttribute("aria-expanded", "false");
    select.size = 1;
  }

  function collapseAll(except = null) {
    document.querySelectorAll(`${SELECTOR}[data-inline-cinema-expanded="true"]`)
      .forEach(select => {
        if (select !== except) collapse(select);
      });
  }

  document.addEventListener("pointerdown", event => {
    const select = getSelect(event.target);

    if (!select) {
      collapseAll();
      return;
    }

    if (isExpanded(select)) {
      return;
    }

    // Prevent the mobile browser native popup. We turn the same select into
    // an inline listbox instead, so no new DOM is inserted into the observed
    // comparison panel and no render loop is triggered.
    event.preventDefault();
    event.stopPropagation();
    expand(select);
  }, true);

  document.addEventListener("change", event => {
    const select = getSelect(event.target);
    if (!select) return;
    collapse(select);
  }, true);

  document.addEventListener("focusout", event => {
    const select = getSelect(event.target);
    if (!select) return;

    requestAnimationFrame(() => {
      if (document.activeElement !== select) {
        collapse(select);
      }
    });
  }, true);

  document.addEventListener("keydown", event => {
    const select = getSelect(event.target);

    if (event.key === "Escape") {
      if (select) {
        collapse(select);
      } else {
        collapseAll();
      }
      return;
    }

    if (
      select &&
      !isExpanded(select) &&
      (event.key === "Enter" || event.key === " " || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      expand(select);
    }
  }, true);
})();