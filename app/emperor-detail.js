(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const DETAIL_TTL_MS = 10 * 60 * 1000;
  const SHOWS_TTL_MS = 60 * 1000;

  const detailCache = new Map();
  const showsCache = new Map();

  const state = {
    movie: null,
    detail: null,
    shows: null,
    loadingDetail: false,
    loadingShows: false,
    detailError: null,
    showsError: null,
    generation: 0,
    detailController: null,
    showsController: null
  };

  function cacheGet(map, key, ttl) {
    const entry = map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > ttl) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }

  function cacheSet(map, key, value) {
    map.set(key, { savedAt: Date.now(), value });
    if (map.size > 48) map.delete(map.keys().next().value);
  }

  async function fetchJson(path, controller) {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Emperor API HTTP ${response.status}`);
    }
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error?.message || `Emperor API HTTP ${response.status}`);
    }
    return result.data;
  }

  function render() {
    if (!state.movie) return;
    window.HKCinemaMovieDetail?.render({
      providerId: "emperor",
      movie: state.movie,
      detail: state.detail,
      shows: state.shows,
      detailLoading: state.loadingDetail,
      detailError: state.detailError,
      showtimesLoading: state.loadingShows,
      showtimesError: state.showsError
    });
  }

  async function loadDetail(movie, generation) {
    const id = String(movie.sourceId || "");
    const cached = cacheGet(detailCache, id, DETAIL_TTL_MS);
    if (cached) {
      if (generation === state.generation) state.detail = cached;
      return;
    }

    state.detailController?.abort();
    const controller = new AbortController();
    state.detailController = controller;
    state.loadingDetail = true;
    state.detailError = null;
    render();

    try {
      const detail = await fetchJson(`/api/emperor/movies/${encodeURIComponent(id)}/detail`, controller);
      cacheSet(detailCache, id, detail);
      if (generation === state.generation && !controller.signal.aborted) state.detail = detail;
    } catch (error) {
      if (error?.name !== "AbortError" && generation === state.generation) {
        state.detailError = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (generation === state.generation) {
        state.loadingDetail = false;
        render();
      }
    }
  }

  async function loadShows(movie, selectedDate, generation, force = false) {
    const id = String(movie.sourceId || "");
    const key = `${id}|${selectedDate || "auto"}`;
    const cached = force ? null : cacheGet(showsCache, key, SHOWS_TTL_MS);
    if (cached) {
      if (generation === state.generation) {
        state.shows = cached;
        state.loadingShows = false;
        state.showsError = null;
        render();
      }
      return;
    }

    state.showsController?.abort();
    const controller = new AbortController();
    state.showsController = controller;
    state.loadingShows = true;
    state.showsError = null;
    if (!selectedDate) state.shows = null;
    render();

    const query = selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : "";
    try {
      const shows = await fetchJson(`/api/emperor/movies/${encodeURIComponent(id)}/shows${query}`, controller);
      cacheSet(showsCache, key, shows);
      if (generation === state.generation && !controller.signal.aborted) state.shows = shows;
    } catch (error) {
      if (error?.name !== "AbortError" && generation === state.generation) {
        state.showsError = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (generation === state.generation) {
        state.loadingShows = false;
        render();
      }
    }
  }

  function open(movie) {
    if (!movie?.sourceId) return false;
    state.generation += 1;
    const generation = state.generation;
    state.detailController?.abort();
    state.showsController?.abort();
    state.movie = movie;
    state.detail = cacheGet(detailCache, String(movie.sourceId), DETAIL_TTL_MS);
    state.shows = null;
    state.loadingDetail = false;
    state.loadingShows = false;
    state.detailError = null;
    state.showsError = null;
    render();
    loadDetail(movie, generation);
    loadShows(movie, null, generation);
    return true;
  }

  function close() {
    state.generation += 1;
    state.detailController?.abort();
    state.showsController?.abort();
    state.detailController = null;
    state.showsController = null;
    state.movie = null;
    state.detail = null;
    state.shows = null;
    state.loadingDetail = false;
    state.loadingShows = false;
    state.detailError = null;
    state.showsError = null;
  }

  window.HKCinemaEmperorDetail = {
    open,
    close,
    clearCache() {
      detailCache.clear();
      showsCache.clear();
    },
    getState() {
      return {
        movie: state.movie,
        detail: state.detail,
        shows: state.shows,
        loadingDetail: state.loadingDetail,
        loadingShows: state.loadingShows,
        detailError: state.detailError,
        showsError: state.showsError
      };
    }
  };

  document.addEventListener("click", event => {
    const dateButton = event.target.closest?.('[data-detail-provider="emperor"][data-detail-date]');
    if (dateButton && state.movie) {
      event.preventDefault();
      event.stopPropagation();
      loadShows(state.movie, dateButton.dataset.detailDate, state.generation);
      return;
    }

    const retryButton = event.target.closest?.('[data-detail-provider="emperor"][data-detail-retry]');
    if (retryButton && state.movie) {
      event.preventDefault();
      loadShows(state.movie, state.shows?.selectedDate || null, state.generation, true);
    }
  });

  window.addEventListener("hkcinema:movie-detail-close", event => {
    if (event.detail?.provider === "emperor") close();
  });

  document.querySelector("#refreshButton")?.addEventListener("click", () => {
    detailCache.clear();
    showsCache.clear();
  });
})();
