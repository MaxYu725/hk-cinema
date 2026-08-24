(() => {
  function aggregateForCard(card) {
    return window.HKCinemaMovieAggregates?.forCard?.(card) || null;
  }

  function openCard(card) {
    const aggregate = aggregateForCard(card);
    if (!aggregate) return false;
    window.HKCinemaHomeLibrary?.recordCard?.(card);
    return window.HKCinemaProviderCompare?.open?.(aggregate.id) !== false;
  }

  window.addEventListener("click", event => {
    if (event.button !== 0 || event.target.closest?.("[data-movie-favorite]")) return;
    const card = event.target.closest?.("#movieGrid [data-movie-aggregate-id]");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openCard(card);
  }, true);

  window.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest?.("[data-movie-favorite]")) return;
    const card = event.target.closest?.("#movieGrid [data-movie-aggregate-id]");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openCard(card);
  }, true);

  window.HKCinemaMovieNavigation = Object.freeze({
    version: "c3-1",
    openCard
  });
})();
