(() => {
  let observer = null;

  function wireDataHealthRefresh() {
    if (document.documentElement.dataset.skin === "metro") return;
    const panel = document.querySelector("#dataHealth");
    if (!panel || panel.dataset.classicFinalRefresh === "true") return;
    panel.dataset.classicFinalRefresh = "true";
    panel.addEventListener("toggle", () => {
      if (!panel.open) return;
      document.querySelector("#refreshButton")?.click();
    });
  }

  function scheduleSync() {
    requestAnimationFrame(() => {
      wireDataHealthRefresh();
    });
  }

  function install() {
    wireDataHealthRefresh();

    window.addEventListener("hkcinema:data-health", scheduleSync);

    observer = new MutationObserver(records => {
      if (!records.some(record => Array.from(record.addedNodes || []).some(node => (
        node?.nodeType === Node.ELEMENT_NODE && (
          node.matches?.("#dataHealth") ||
          node.querySelector?.("#dataHealth")
        )
      )))) return;
      scheduleSync();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.HKCinemaClassicFinalPolish = Object.freeze({
    version: "classic-final-m6b-1",
    refresh: scheduleSync
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
