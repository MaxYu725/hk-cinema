(() => {
  function invalidateHomeAggregates() {
    document.querySelectorAll("#movieGrid [data-phase8a-aggregate-id]").forEach(card => {
      delete card.dataset.phase8aAggregateId;
    });
    window.HKCinemaMovieAggregates?.refresh?.();
  }

  window.addEventListener("hkcinema:provider-matches", invalidateHomeAggregates);
  window.addEventListener("hkcinema:mcl-catalogue", invalidateHomeAggregates);
  window.addEventListener("hkcinema:emperor-catalogue", invalidateHomeAggregates);
})();
