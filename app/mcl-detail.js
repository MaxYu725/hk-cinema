(() => {
  const state = {
    movie: null,
    ticketing: null,
    loading: false,
    error: null,
    generation: 0
  };

  function reportMovieMetadata(movie, ticketing) {
    const sessions = ticketing?.allSessions || ticketing?.sessions || [];
    const normalized = sessions.map(session =>
      window.HKCinemaViewModels?.showtime?.("mcl", session)
    ).filter(Boolean);
    const languages = Array.from(new Set(normalized.flatMap(session => session.metadata?.languages || [])));
    const formats = Array.from(new Set(normalized.flatMap(session => session.metadata?.formats || [])));
    const ticketingReleaseDate = (ticketing?.availableDates || [])
      .map(value => String(value || "").slice(0, 10))
      .filter(Boolean)
      .sort()[0] || null;
    window.dispatchEvent(new CustomEvent("hkcinema:movie-metadata", {
      detail: {
        provider: "mcl",
        sourceId: String(movie?.sourceId || ""),
        languages,
        formats,
        releaseDate: movie?.releaseDate || ticketingReleaseDate
      }
    }));
  }

  function render() {
    if (!state.movie) return;
    window.HKCinemaMovieDetail?.render({
      providerId: "mcl",
      movie: state.movie,
      shows: state.ticketing,
      showtimesLoading: state.loading,
      showtimesError: state.error
    });
  }

  async function load(movie, selectedDate = null) {
    const provider = window.HKCinemaProviders?.mcl;
    const generation = ++state.generation;
    state.movie = movie;
    state.loading = true;
    state.error = null;
    state.ticketing = null;

    // Open immediately so slower MCL network paths still provide instant mobile feedback.
    render();

    if (!provider?.getTicketing) {
      state.loading = false;
      state.error = "MCL ticketing provider 未能載入。";
      render();
      return;
    }

    try {
      const ticketing = await provider.getTicketing(movie.sourceId, selectedDate);
      if (generation !== state.generation) return;
      state.ticketing = ticketing;
      reportMovieMetadata(movie, ticketing);
    } catch (error) {
      if (generation !== state.generation) return;
      state.error = error?.name === "AbortError"
        ? "MCL 場次連線逾時，請稍後再試。"
        : error instanceof Error
          ? error.message
          : String(error);
    } finally {
      if (generation === state.generation) {
        state.loading = false;
        render();
      }
    }
  }

  function close() {
    state.generation += 1;
    state.movie = null;
    state.ticketing = null;
    state.loading = false;
    state.error = null;
  }

  window.HKCinemaMCLDetail = {
    open(movie) {
      if (!movie) return false;
      load(movie);
      return true;
    },
    load,
    close,
    getState() {
      return {
        movie: state.movie,
        ticketing: state.ticketing,
        loading: state.loading,
        error: state.error
      };
    }
  };

  window.addEventListener("hkcinema:mcl-open", event => {
    const movie = event.detail?.movie;
    if (movie) load(movie);
  });

  window.addEventListener("hkcinema:movie-detail-close", event => {
    if (event.detail?.provider === "mcl") close();
  });

  document.addEventListener("click", event => {
    const dateButton = event.target.closest?.('[data-detail-provider="mcl"][data-detail-date]');
    if (dateButton && state.movie) {
      event.preventDefault();
      event.stopPropagation();
      load(state.movie, dateButton.dataset.detailDate);
      return;
    }

    const retryButton = event.target.closest?.('[data-detail-provider="mcl"][data-detail-retry]');
    if (retryButton && state.movie) {
      event.preventDefault();
      load(state.movie, state.ticketing?.selectedDate || null);
    }
  }, true);
})();
