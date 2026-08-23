(() => {
  let scheduled = false;

  function centerSelectedDate() {
    const overlay = document.querySelector("#providerCompareOverlay");
    if (!overlay || overlay.hidden) return false;

    const scroller = overlay.querySelector(".provider-compare-dates");
    const selected = scroller?.querySelector(".provider-compare-date.active[data-provider-compare-date]");
    if (!scroller || !selected || scroller.clientWidth <= 0) return false;

    const scrollerRect = scroller.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    const selectedCenter = scroller.scrollLeft +
      (selectedRect.left - scrollerRect.left) + (selectedRect.width / 2);
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollLeft = Math.min(maxScroll, Math.max(0, selectedCenter - (scroller.clientWidth / 2)));
    return true;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scheduled = false;
      centerSelectedDate();
    }));
  }

  function install() {
    schedule();
    window.addEventListener("hkcinema:provider-compare-open", schedule);
    window.addEventListener("hkcinema:provider-compare-lifecycle", schedule);

    const observer = new MutationObserver(records => {
      const relevant = records.some(record => {
        const target = record.target?.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target?.parentElement;
        return Boolean(target?.closest?.("#providerCompareContent"));
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.HKCinemaComparisonDateScroll = Object.freeze({
    version: "c2-1",
    refresh: schedule,
    centerSelectedDate
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
