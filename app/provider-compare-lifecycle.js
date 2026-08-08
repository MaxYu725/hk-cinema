(() => {
  function emit(type, detail = {}) {
    window.dispatchEvent(
      new CustomEvent("hkcinema:provider-compare-lifecycle", {
        detail: { type, ...detail }
      })
    );
  }

  document.addEventListener("click", event => {
    const openButton = event.target.closest?.("[data-compare-open]");
    if (openButton) {
      emit("open", {
        matchId: openButton.dataset.compareOpen || null
      });
      return;
    }

    if (event.target.closest?.("[data-provider-compare-close]")) {
      emit("close");
      return;
    }

    const dateButton = event.target.closest?.("[data-provider-compare-date]");
    if (dateButton) {
      emit("date-change", {
        date: dateButton.dataset.providerCompareDate || null
      });
      return;
    }

    if (event.target.closest?.("[data-provider-compare-retry]")) {
      emit("reload");
    }
  }, true);
})();
