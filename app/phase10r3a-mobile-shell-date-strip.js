(() => {
  let scheduled = false;

  function placeHomeDataHealth() {
    const tools = document.querySelector("#homeLibraryTools");
    const panel = document.querySelector("#dataHealth");
    if (!tools || !panel) return false;

    if (panel.parentElement !== tools) {
      const filters = tools.querySelector(".home-library-filter-options");
      if (filters) filters.insertAdjacentElement("afterend", panel);
      else tools.appendChild(panel);
    }
    panel.dataset.phase10r3aHomeHealth = "true";
    return true;
  }

  function centerSelectedDate() {
    const overlay = document.querySelector("#providerCompareOverlay");
    if (!overlay || overlay.hidden) return false;

    const scroller = overlay.querySelector(".provider-compare-dates");
    const selected = scroller?.querySelector(".provider-compare-date.active[data-provider-compare-date]");
    if (!scroller || !selected || scroller.clientWidth <= 0) return false;

    const scrollerRect = scroller.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    const selectedCenterInContent = scroller.scrollLeft +
      (selectedRect.left - scrollerRect.left) + (selectedRect.width / 2);
    const target = selectedCenterInContent - (scroller.clientWidth / 2);
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollLeft = Math.min(maxScroll, Math.max(0, target));
    return true;
  }

  function apply() {
    scheduled = false;
    placeHomeDataHealth();
    centerSelectedDate();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    /* Two frames let the comparison layout decorator apply its sticky/date
       classes before measuring the replacement date scroller. */
    requestAnimationFrame(() => requestAnimationFrame(apply));
  }

  function addedContains(node, selector) {
    if (node?.nodeType !== Node.ELEMENT_NODE) return false;
    return node.matches?.(selector) || Boolean(node.querySelector?.(selector));
  }

  function install() {
    placeHomeDataHealth();
    schedule();

    window.addEventListener("hkcinema:data-health", schedule);
    window.addEventListener("hkcinema:provider-compare-open", schedule);
    window.addEventListener("hkcinema:home-tab", schedule);

    const observer = new MutationObserver(records => {
      const relevant = records.some(record => Array.from(record.addedNodes || []).some(node => (
        addedContains(node, "#dataHealth") ||
        addedContains(node, "#homeLibraryTools") ||
        addedContains(node, ".provider-compare-date-rail")
      )));
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.HKCinemaPhase10R3A = Object.freeze({
    version: "10r3a-1",
    refresh: schedule,
    centerSelectedDate,
    placeHomeDataHealth
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
