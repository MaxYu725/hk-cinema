(() => {
  const sharedCore = window.HKCinemaProviderSharedCore || null;
  const LEGACY_HOME_PROVIDERS = new Set(["broadway", "mcl", "emperor"]);
  const catalogues = new Map();
  let scheduled = false;

  function providers() {
    return sharedCore?.providers?.() || [];
  }

  function descriptor(providerId) {
    return providers().find(provider => provider.key === providerId)?.descriptor ||
      window.HKCinemaProviderRegistry?.get?.(providerId) ||
      null;
  }

  function isHomeEligible(providerId) {
    const provider = descriptor(providerId);
    return Boolean(
      provider?.capabilities?.catalogue === true &&
      provider?.capabilities?.showtimes === true
    );
  }

  function normalizeTitle(value) {
    return window.HKCinemaHomeDiscoveryCore?.normalizeTitle?.(value) ||
      String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function metadataValues(value) {
    const source = Array.isArray(value) ? value : [value];
    return Array.from(new Set(source
      .flatMap(item => String(item || "").split(/[、,，/;；]+/))
      .map(item => item.trim())
      .filter(Boolean)));
  }

  function metadataAttribute(value) {
    return escapeHtml(JSON.stringify(metadataValues(value)));
  }

  function providerSources(card) {
    try {
      const parsed = JSON.parse(card?.dataset?.providerSources || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeProviderSources(card, sources) {
    const clean = Object.fromEntries(Object.entries(sources || {})
      .map(([provider, sourceId]) => [provider, String(sourceId || "").trim()])
      .filter(([, sourceId]) => Boolean(sourceId)));
    if (Object.keys(clean).length) card.dataset.providerSources = JSON.stringify(clean);
    else delete card.dataset.providerSources;
  }

  function mergeMetadata(card, movie) {
    if (!card || !movie) return;

    const read = key => {
      try {
        const parsed = JSON.parse(card.dataset[key] || "[]");
        return metadataValues(parsed);
      } catch {
        return metadataValues(card.dataset[key]);
      }
    };

    card.dataset.homeLanguages = JSON.stringify(Array.from(new Set([
      ...read("homeLanguages"),
      ...metadataValues(movie.language)
    ])));
    card.dataset.homeFormats = JSON.stringify(Array.from(new Set([
      ...read("homeFormats"),
      ...metadataValues(movie.formats || movie.format)
    ])));
    if (!card.dataset.homeReleaseDate && movie.releaseDate) {
      card.dataset.homeReleaseDate = String(movie.releaseDate).slice(0, 10);
    }
  }

  function movieTitle(movie) {
    return movie?.title?.zh || movie?.title?.en || "未命名電影";
  }

  function activeMovies(catalogue) {
    const tab = document.querySelector(".tab.active")?.dataset.tab || "now";
    return tab === "coming"
      ? catalogue?.coming || []
      : catalogue?.now || [];
  }

  function renderProviderOnlyCard(movie, providerId) {
    const title = movieTitle(movie);
    const poster = movie.poster
      ? `<img src="${escapeHtml(movie.poster)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('poster-error');">`
      : "";
    const upcoming = (document.querySelector(".tab.active")?.dataset.tab || "now") === "coming"
      ? `<div class="movie-badges"><span class="movie-badge coming">即將上映</span></div>`
      : "";
    const sourceId = String(movie.sourceId || movie.id || "").replace(new RegExp(`^${providerId}:`), "");

    return `
      <article
        class="movie-card registry-provider-only-card"
        data-registry-provider-only="${escapeHtml(providerId)}"
        data-provider="${escapeHtml(providerId)}"
        data-source-id="${escapeHtml(sourceId)}"
        data-provider-sources="${escapeHtml(JSON.stringify({ [providerId]: sourceId }))}"
        data-home-languages="${metadataAttribute(movie.language)}"
        data-home-formats="${metadataAttribute(movie.formats || movie.format)}"
        data-home-release-date="${escapeHtml(movie.releaseDate || "")}"
        role="button"
        tabindex="0"
        aria-label="查看 ${escapeHtml(title)} 電影資料及場次"
      >
        <div class="movie-poster">
          ${poster}
          ${upcoming}
          <button type="button" class="movie-favorite-button" data-movie-favorite aria-label="收藏${escapeHtml(title)}" aria-pressed="false" title="收藏"></button>
          <div class="poster-placeholder">電影</div>
        </div>
        <div class="movie-info"><h3>${escapeHtml(title)}</h3></div>
      </article>
    `;
  }

  function clearProvider(providerId, grid) {
    grid.querySelectorAll(`[data-registry-provider-only='${CSS.escape(providerId)}']`).forEach(card => card.remove());
    for (const card of grid.querySelectorAll(".movie-card")) {
      const sources = providerSources(card);
      if (!sources[providerId]) continue;
      delete sources[providerId];
      writeProviderSources(card, sources);
    }
  }

  function applyProvider(providerId, catalogue, grid) {
    clearProvider(providerId, grid);
    if (!isHomeEligible(providerId)) return;

    const movies = activeMovies(catalogue);
    const byTitle = new Map();
    for (const card of grid.querySelectorAll(".movie-card")) {
      const key = normalizeTitle(card.querySelector("h3")?.textContent);
      if (key && !byTitle.has(key)) byTitle.set(key, card);
    }

    for (const movie of movies) {
      const sourceId = String(movie?.sourceId || movie?.id || "").replace(new RegExp(`^${providerId}:`), "").trim();
      const key = normalizeTitle(movieTitle(movie));
      if (!sourceId || !key) continue;

      const matchingCard = byTitle.get(key);
      if (matchingCard) {
        const sources = providerSources(matchingCard);
        sources[providerId] = sourceId;
        writeProviderSources(matchingCard, sources);
        mergeMetadata(matchingCard, movie);
        continue;
      }

      grid.insertAdjacentHTML("beforeend", renderProviderOnlyCard(movie, providerId));
      const card = grid.lastElementChild;
      if (card) byTitle.set(key, card);
    }
  }

  function apply() {
    scheduled = false;
    const grid = document.querySelector("#movieGrid");
    if (!grid) return;
    const broadwayState = grid.dataset.broadwayState || "loading";
    if (broadwayState === "loading") return;

    for (const provider of providers()) {
      if (LEGACY_HOME_PROVIDERS.has(provider.key)) continue;
      const catalogue = catalogues.get(provider.key) || window.HKCinemaProviders?.[provider.key]?.catalogue || null;
      if (!catalogue) continue;
      applyProvider(provider.key, catalogue, grid);
    }

    window.HKCinemaMovieAggregates?.refresh?.();
    window.HKCinemaHomeLibrary?.apply?.();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(apply);
  }

  window.addEventListener("hkcinema:provider-catalogue", event => {
    const providerId = String(event.detail?.provider || "").toLowerCase();
    const catalogue = event.detail?.catalogue;
    if (!providerId || LEGACY_HOME_PROVIDERS.has(providerId) || !catalogue) return;
    catalogues.set(providerId, catalogue);
    schedule();
  });

  document.addEventListener("click", event => {
    if (event.target.closest?.(".tab")) schedule();
  });

  const grid = document.querySelector("#movieGrid");
  if (grid) {
    const observer = new MutationObserver(() => schedule());
    observer.observe(grid, { childList: true, subtree: false });
  }

  window.HKCinemaRegistryCatalogueExtension = Object.freeze({
    version: "m7c-1",
    isHomeEligible,
    refresh: schedule,
    getCatalogue(providerId) {
      return catalogues.get(String(providerId || "").toLowerCase()) || null;
    }
  });
})();
