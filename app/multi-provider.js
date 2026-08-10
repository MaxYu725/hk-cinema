(() => {
  let mclCatalogue = window.HKCinemaMCLCatalogue || null;
  let emperorCatalogue = window.HKCinemaEmperorCatalogue || null;

  const grid = document.querySelector("#movieGrid");
  const count = document.querySelector("#movieCount");
  const PROVIDER_OPTIONS = [
    { key: "broadway", label: "Broadway" },
    { key: "mcl", label: "MCL" },
    { key: "emperor", label: "Emperor" }
  ];

  if (!grid || !count) return;

  const matchRecords = new Map();
  const groupRecords = new Map();

  window.HKCinemaProviderMatches = {
    get(id) {
      return matchRecords.get(String(id)) || null;
    },
    all() {
      return Array.from(matchRecords.values());
    }
  };

  window.HKCinemaMovieGroups = {
    get(id) {
      return groupRecords.get(String(id)) || null;
    },
    all() {
      return Array.from(groupRecords.values());
    }
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function metadataValues(value) {
    let source = value;
    if (typeof source === "string" && source.trim().startsWith("[")) {
      try {
        source = JSON.parse(source);
      } catch {
        source = [source];
      }
    }

    const values = Array.isArray(source) ? source : [source];
    return Array.from(new Set(values
      .flatMap(item => String(item || "").split(/[、,，/;；]+/))
      .map(item => item.trim())
      .filter(Boolean)));
  }

  function metadataAttribute(value) {
    return escapeHtml(JSON.stringify(metadataValues(value)));
  }

  function readCardMetadata(card, key) {
    return metadataValues(card?.dataset?.[key] || []);
  }

  function writeCardMetadata(card, key, values) {
    if (!card) return;
    card.dataset[key] = JSON.stringify(metadataValues(values));
  }

  function mergeMovieMetadata(card, movie) {
    if (!card || !movie) return;

    writeCardMetadata(card, "homeLanguages", [
      ...readCardMetadata(card, "homeLanguages"),
      ...metadataValues(movie.language)
    ]);

    writeCardMetadata(card, "homeFormats", [
      ...readCardMetadata(card, "homeFormats"),
      ...metadataValues(movie.formats || movie.format)
    ]);

    if (!card.dataset.homeReleaseDate && movie.releaseDate) {
      card.dataset.homeReleaseDate = String(movie.releaseDate).slice(0, 10);
    }
  }

  function normalizeTitle(value) {
    return window.HKCinemaHomeDiscoveryCore.normalizeTitle(value);
  }

  function parseVariantTitle(value) {
    return window.HKCinemaHomeDiscoveryCore.parseVariantTitle(value);
  }

  function variantSignature(value) {
    return window.HKCinemaHomeDiscoveryCore.variantSignature(value);
  }

  function showtimeMetadata() {
    return window.HKCinemaShowtimeMetadata || null;
  }

  function getActiveTab() {
    return document.querySelector(".tab.active")?.dataset.tab || "now";
  }

  function getMCLMovies() {
    if (!mclCatalogue) return [];
    return getActiveTab() === "coming"
      ? mclCatalogue.coming || []
      : mclCatalogue.now || [];
  }

  function getEmperorMovies() {
    if (!emperorCatalogue) return [];
    return getActiveTab() === "coming"
      ? emperorCatalogue.coming || []
      : emperorCatalogue.now || [];
  }

  function findMCLMovie(sourceId) {
    if (!mclCatalogue) return null;
    return [
      ...(mclCatalogue.now || []),
      ...(mclCatalogue.coming || []),
      ...(mclCatalogue.festival || [])
    ].find(movie => String(movie.sourceId) === String(sourceId)) || null;
  }

  function findEmperorMovie(sourceId) {
    if (!emperorCatalogue) return null;
    return [
      ...(emperorCatalogue.now || []),
      ...(emperorCatalogue.coming || [])
    ].find(movie => String(movie.sourceId) === String(sourceId)) || null;
  }

  function movieTitle(movie) {
    return movie?.title?.zh || movie?.title?.en || "未命名電影";
  }

  function renderProviderOnlyCard(movie, provider) {
    const title = movieTitle(movie);
    const providerClass = provider === "mcl" ? "mcl-only-card" : "emperor-only-card";
    const poster = movie.poster
      ? `
        <img
          src="${escapeHtml(movie.poster)}"
          alt="${escapeHtml(title)}"
          loading="lazy"
          onerror="this.style.display='none';this.parentElement.classList.add('poster-error');"
        >
      `
      : "";
    const upcomingBadge = getActiveTab() === "coming"
      ? `
        <div class="movie-badges">
          <span class="movie-badge coming">即將上映</span>
        </div>
      `
      : "";

    return `
      <article
        class="movie-card ${providerClass}"
        data-provider="${provider}"
        data-source-id="${escapeHtml(movie.sourceId)}"
        data-booking-url="${escapeHtml(movie.bookingUrl || "")}"
        data-home-languages="${metadataAttribute(movie.language)}"
        data-home-formats="${metadataAttribute(movie.formats || movie.format)}"
        data-home-release-date="${escapeHtml(movie.releaseDate || "")}"
        role="button"
        tabindex="0"
        aria-label="查看 ${escapeHtml(title)} 電影資料及場次"
      >
        <div class="movie-poster">
          ${poster}
          ${upcomingBadge}
          <button
            type="button"
            class="movie-favorite-button"
            data-movie-favorite
            aria-label="收藏${escapeHtml(title)}"
            aria-pressed="false"
            title="收藏"
          ></button>
          <div class="poster-placeholder">電影</div>
        </div>
        <div class="movie-info">
          <h3>${escapeHtml(title)}</h3>
        </div>
      </article>
    `;
  }

  function cardProviderData(card) {
    const isMCLOnly = card.classList.contains("mcl-only-card");
    const isEmperorOnly = card.classList.contains("emperor-only-card");

    const broadwaySourceId = !isMCLOnly && !isEmperorOnly
      ? String(card.dataset.sourceId || "").trim()
      : "";
    const mclSourceId = String(
      card.dataset.mclSourceId ||
      (isMCLOnly ? card.dataset.sourceId : "") ||
      ""
    ).trim();
    const emperorSourceId = String(
      card.dataset.emperorSourceId ||
      (isEmperorOnly ? card.dataset.sourceId : "") ||
      ""
    ).trim();

    return {
      broadwaySourceId,
      mclSourceId,
      emperorSourceId
    };
  }

  function cardProviders(card) {
    const data = cardProviderData(card);
    const labels = [];
    if (data.broadwaySourceId) labels.push("Broadway");
    if (data.mclSourceId) labels.push("MCL");
    if (data.emperorSourceId) labels.push("Emperor");
    return labels;
  }

  function setCardProviders(card, labels) {
    const keys = labels
      .map(label => String(label || "").toLowerCase())
      .filter(key => PROVIDER_OPTIONS.some(provider => provider.key === key));
    card.dataset.providers = Array.from(new Set(keys)).join(",");
  }

  function buildMatchRecord(card) {
    const data = cardProviderData(card);
    const components = [];

    if (data.broadwaySourceId) components.push(`broadway:${data.broadwaySourceId}`);
    if (data.mclSourceId) components.push(`mcl:${data.mclSourceId}`);
    if (data.emperorSourceId) components.push(`emperor:${data.emperorSourceId}`);

    if (components.length < 2) {
      delete card.dataset.providerMatchId;
      return null;
    }

    const title = card.querySelector("h3")?.textContent?.trim() || "未命名電影";
    const matchId = components.join("|");
    const record = {
      id: matchId,
      title,
      normalizedTitle: normalizeTitle(title),
      matchType: "exact-title",
      confidence: 1,
      broadway: data.broadwaySourceId
        ? {
            provider: "broadway",
            sourceId: data.broadwaySourceId,
            movieId: card.dataset.movieId || null,
            poster: card.querySelector(".movie-poster img")?.src || null
          }
        : null,
      mcl: data.mclSourceId
        ? {
            provider: "mcl",
            sourceId: data.mclSourceId,
            movie: findMCLMovie(data.mclSourceId)
          }
        : null,
      emperor: data.emperorSourceId
        ? {
            provider: "emperor",
            sourceId: data.emperorSourceId,
            movie: findEmperorMovie(data.emperorSourceId)
          }
        : null
    };

    matchRecords.set(matchId, record);
    card.dataset.providerMatchId = matchId;
    return record;
  }

  function resetVariantGrouping() {
    for (const card of grid.querySelectorAll(".movie-card")) {
      const heading = card.querySelector(".movie-info h3");
      const english = card.querySelector(".movie-title-en");

      if (heading && card.dataset.originalGroupTitle) {
        heading.textContent = card.dataset.originalGroupTitle;
      }
      if (english && card.dataset.originalGroupEnglish) {
        english.textContent = card.dataset.originalGroupEnglish;
      }

      delete card.dataset.originalGroupTitle;
      delete card.dataset.originalGroupEnglish;
      delete card.dataset.movieGroupId;
      delete card.dataset.groupMemberOf;
      card.classList.remove("movie-group-card", "movie-group-member");
      card.hidden = false;
    }

    groupRecords.clear();
  }

  function variantFromCard(card) {
    const title = card.querySelector(".movie-info h3")?.textContent?.trim() || "未命名電影";
    const parsed = parseVariantTitle(title);
    const providerData = cardProviderData(card);

    return {
      card,
      title,
      parsed,
      tags: parsed.tags,
      languages: readCardMetadata(card, "homeLanguages"),
      formats: readCardMetadata(card, "homeFormats"),
      releaseDate: String(card.dataset.homeReleaseDate || ""),
      providers: cardProviders(card),
      broadwaySourceId: providerData.broadwaySourceId || null,
      mclSourceId: providerData.mclSourceId || null,
      emperorSourceId: providerData.emperorSourceId || null,
      comparisonMclSourceId: null,
      comparisonProviderCount: cardProviders(card).length,
      sessionCriteria: null,
      broadwayMovieId: card.dataset.movieId || null,
      poster: card.querySelector(".movie-poster img")?.src || null,
      matchId: card.dataset.providerMatchId || null
    };
  }

  function buildVariantMatchRecord(groupId, variant, index) {
    const comparisonMclSourceId = variant.mclSourceId || variant.comparisonMclSourceId;
    const sources = PROVIDER_OPTIONS
      .map(provider => [
        provider.key,
        provider.key === "mcl"
          ? comparisonMclSourceId
          : variant[`${provider.key}SourceId`]
      ])
      .filter(([, sourceId]) => Boolean(sourceId));

    if (sources.length < 2) return null;

    const matchId = `${groupId}:variant:${index + 1}`;
    matchRecords.set(matchId, {
      id: matchId,
      title: variant.title,
      normalizedTitle: normalizeTitle(variant.title),
      matchType: "normalized-variant",
      confidence: 0.96,
      broadway: variant.broadwaySourceId
        ? {
            provider: "broadway",
            sourceId: variant.broadwaySourceId,
            movieId: variant.broadwayMovieId || null,
            poster: variant.poster || null
          }
        : null,
      mcl: comparisonMclSourceId
        ? {
            provider: "mcl",
            sourceId: comparisonMclSourceId,
            movie: findMCLMovie(comparisonMclSourceId)
          }
        : null,
      emperor: variant.emperorSourceId
        ? {
            provider: "emperor",
            sourceId: variant.emperorSourceId,
            movie: findEmperorMovie(variant.emperorSourceId)
          }
        : null,
      sessionCriteria: variant.sessionCriteria || null,
      comparisonOnlyProviders: variant.comparisonMclSourceId ? ["mcl"] : []
    });

    return matchId;
  }

  function coalesceVariants(groupId, groupTitle, variants) {
    const bySignature = new Map();

    for (const variant of variants) {
      const signature = variantSignature(variant.parsed);
      if (!bySignature.has(signature)) {
        bySignature.set(signature, {
          title: variant.title,
          tags: [...variant.tags],
          languages: [...variant.languages],
          formats: [...variant.formats],
          releaseDate: variant.releaseDate || null,
          providers: [],
          broadwaySourceId: null,
          mclSourceId: null,
          emperorSourceId: null,
          comparisonMclSourceId: null,
          comparisonProviderCount: 0,
          sessionCriteria: null,
          broadwayMovieId: null,
          poster: null,
          matchId: null
        });
      }

      const combined = bySignature.get(signature);

      for (const provider of PROVIDER_OPTIONS) {
        const sourceKey = `${provider.key}SourceId`;
        if (!combined[sourceKey] && variant[sourceKey]) {
          combined[sourceKey] = variant[sourceKey];
        }
      }

      if (!combined.broadwayMovieId && variant.broadwayMovieId) {
        combined.broadwayMovieId = variant.broadwayMovieId;
      }
      if (!combined.poster && variant.poster) combined.poster = variant.poster;
      if (!combined.matchId && variant.matchId) combined.matchId = variant.matchId;

      combined.languages = Array.from(new Set([
        ...combined.languages,
        ...variant.languages
      ]));
      combined.formats = Array.from(new Set([
        ...combined.formats,
        ...variant.formats
      ]));
      if (!combined.releaseDate && variant.releaseDate) {
        combined.releaseDate = variant.releaseDate;
      }

      combined.providers = PROVIDER_OPTIONS
        .filter(provider => Boolean(combined[`${provider.key}SourceId`]))
        .map(provider => provider.label);
    }

    const combinedVariants = Array.from(bySignature.values());
    const genericMCL = combinedVariants.find(variant => (
      variant.mclSourceId &&
      showtimeMetadata()?.isGenericBridgeSource?.(variant.tags)
    ));

    return combinedVariants.map((variant, index) => {
      const label = variant.tags.join(" · ");
      const displayTitle = label ? `${groupTitle}（${label}）` : groupTitle;
      const combined = { ...variant, title: displayTitle };
      const criteria = showtimeMetadata()?.criteriaFromVariant?.(variant.tags) || null;

      if (
        !combined.mclSourceId &&
        genericMCL?.mclSourceId &&
        criteria?.bridgeEligible
      ) {
        combined.comparisonMclSourceId = genericMCL.mclSourceId;
        combined.sessionCriteria = {
          languages: [...criteria.languages],
          subtitles: [],
          formats: [...criteria.formats]
        };
      }

      combined.comparisonProviderCount = PROVIDER_OPTIONS.filter(provider => (
        provider.key === "mcl"
          ? Boolean(combined.mclSourceId || combined.comparisonMclSourceId)
          : Boolean(combined[`${provider.key}SourceId`])
      )).length;

      combined.matchId = buildVariantMatchRecord(groupId, combined, index);
      return combined;
    });
  }

  function applyVariantGrouping() {
    groupRecords.clear();
    const cards = Array.from(grid.querySelectorAll(".movie-card"));
    const candidates = new Map();

    for (const card of cards) {
      const variant = variantFromCard(card);
      setCardProviders(card, variant.providers);

      if (!variant.parsed.key || variant.parsed.key.length < 3) continue;
      if (!candidates.has(variant.parsed.key)) {
        candidates.set(variant.parsed.key, []);
      }
      candidates.get(variant.parsed.key).push(variant);
    }

    for (const [key, variants] of candidates) {
      if (variants.length < 2 || !variants.some(variant => variant.parsed.hasVariant)) {
        continue;
      }

      const primary = variants[0];
      const groupId = `versions:${key}`;
      const title = variants
        .map(variant => variant.parsed.base)
        .filter(Boolean)
        .sort((a, b) => a.length - b.length)[0] || primary.title;

      const providerLabels = PROVIDER_OPTIONS
        .filter(provider => variants.some(variant => variant.providers.includes(provider.label)))
        .map(provider => provider.label);

      const groupedVariants = coalesceVariants(groupId, title, variants);
      const groupedLanguages = Array.from(new Set(
        variants.flatMap(variant => variant.languages)
      ));
      const groupedFormats = Array.from(new Set(
        variants.flatMap(variant => variant.formats)
      ));
      const groupedReleaseDates = variants
        .map(variant => variant.releaseDate)
        .filter(Boolean)
        .sort();

      groupRecords.set(groupId, {
        id: groupId,
        title,
        providers: providerLabels,
        variants: groupedVariants
      });

      const heading = primary.card.querySelector(".movie-info h3");
      const english = primary.card.querySelector(".movie-title-en");

      primary.card.dataset.originalGroupTitle = primary.title;
      if (heading) heading.textContent = title;

      if (english) {
        primary.card.dataset.originalGroupEnglish = english.textContent || "";
        english.textContent = parseVariantTitle(english.textContent).base;
      }

      primary.card.dataset.movieGroupId = groupId;
      primary.card.classList.add("movie-group-card");
      primary.card.setAttribute("aria-label", `查看 ${title} 電影資料及場次`);
      writeCardMetadata(primary.card, "homeLanguages", groupedLanguages);
      writeCardMetadata(primary.card, "homeFormats", groupedFormats);
      primary.card.dataset.homeReleaseDate = getActiveTab() === "coming"
        ? groupedReleaseDates[0] || ""
        : groupedReleaseDates.at(-1) || "";
      setCardProviders(primary.card, providerLabels);

      for (const variant of variants.slice(1)) {
        variant.card.classList.add("movie-group-member");
        variant.card.dataset.groupMemberOf = groupId;
        variant.card.hidden = true;
      }
    }
  }

  function updateMovieCount(matched, tripleMatched) {
    const total = grid.querySelectorAll(".movie-card:not(.movie-group-member)").length;
    count.textContent = `${total} 部`;
    count.title = `合併版本後 ${total} 部 · 跨院線配對 ${matched} 部 · 三院線配對 ${tripleMatched} 部`;
    window.HKCinemaHomeLibrary?.apply?.();
  }

  function applyCatalogue() {
    if (count.textContent.trim() === "—") return;

    observer.disconnect();

    try {
      matchRecords.clear();
      resetVariantGrouping();

      grid.querySelectorAll(".mcl-only-card, .emperor-only-card").forEach(card => card.remove());
      grid.querySelectorAll("[data-mcl-source-id]").forEach(card => delete card.dataset.mclSourceId);
      grid.querySelectorAll("[data-emperor-source-id]").forEach(card => delete card.dataset.emperorSourceId);
      grid.querySelectorAll("[data-provider-match-id]").forEach(card => delete card.dataset.providerMatchId);

      const broadwayCards = Array.from(grid.querySelectorAll(
        ".movie-card:not(.mcl-only-card):not(.emperor-only-card)"
      ));
      const byTitle = new Map();

      for (const card of broadwayCards) {
        const key = normalizeTitle(card.querySelector("h3")?.textContent);
        if (key && !byTitle.has(key)) byTitle.set(key, card);
      }

      for (const movie of getMCLMovies()) {
        const key = normalizeTitle(movieTitle(movie));
        if (!key) continue;

        const matchingCard = byTitle.get(key);
        if (matchingCard) {
          matchingCard.dataset.mclSourceId = movie.sourceId;
          mergeMovieMetadata(matchingCard, movie);
          continue;
        }

        grid.insertAdjacentHTML("beforeend", renderProviderOnlyCard(movie, "mcl"));
        const card = grid.lastElementChild;
        if (card) byTitle.set(key, card);
      }

      for (const movie of getEmperorMovies()) {
        const key = normalizeTitle(movieTitle(movie));
        if (!key) continue;

        const matchingCard = byTitle.get(key);
        if (matchingCard) {
          matchingCard.dataset.emperorSourceId = movie.sourceId;
          mergeMovieMetadata(matchingCard, movie);
          continue;
        }

        grid.insertAdjacentHTML("beforeend", renderProviderOnlyCard(movie, "emperor"));
        const card = grid.lastElementChild;
        if (card) byTitle.set(key, card);
      }

      let matched = 0;
      let tripleMatched = 0;

      for (const card of grid.querySelectorAll(".movie-card")) {
        const record = buildMatchRecord(card);
        if (!record) continue;
        matched += 1;
        if (record.broadway && record.mcl && record.emperor) {
          tripleMatched += 1;
        }
      }

      applyVariantGrouping();
      updateMovieCount(matched, tripleMatched);

      window.dispatchEvent(new CustomEvent("hkcinema:provider-matches", {
        detail: {
          matches: Array.from(matchRecords.values()),
          count: matchRecords.size,
          tripleMatched,
          movieGroups: Array.from(groupRecords.values()),
          movieGroupCount: groupRecords.size
        }
      }));
    } finally {
      observer.observe(grid, { childList: true, subtree: true });
    }
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;

    queued = true;
    queueMicrotask(() => {
      queued = false;
      applyCatalogue();
    });
  });

  observer.observe(grid, { childList: true, subtree: true });

  window.addEventListener("hkcinema:mcl-catalogue", event => {
    mclCatalogue = event.detail;
    applyCatalogue();
  });

  window.addEventListener("hkcinema:emperor-catalogue", event => {
    emperorCatalogue = event.detail;
    applyCatalogue();
  });

  window.addEventListener("hkcinema:movie-metadata", event => {
    const detail = event.detail || {};
    const sourceId = String(detail.sourceId || "");
    if (!sourceId) return;

    const sourceKey = `${detail.provider || ""}SourceId`;

    for (const card of grid.querySelectorAll(".movie-card")) {
      const directSource = (
        card.dataset.sourceId === sourceId &&
        card.dataset.provider === detail.provider
      );
      const matchedSource = card.dataset[sourceKey] === sourceId;

      if (!directSource && !matchedSource) continue;

      mergeMovieMetadata(card, {
        language: detail.languages,
        formats: detail.formats,
        releaseDate: detail.releaseDate
      });

      if (card.dataset.groupMemberOf) {
        const primary = grid.querySelector(
          `[data-movie-group-id='${CSS.escape(card.dataset.groupMemberOf)}']`
        );
        mergeMovieMetadata(primary, {
          language: detail.languages,
          formats: detail.formats,
          releaseDate: detail.releaseDate
        });
      }
    }

    window.HKCinemaHomeLibrary?.apply?.();
  });

  window.HKCinemaMultiProvider = Object.freeze({
    version: "8e2",
    refresh: applyCatalogue
  });

  if (mclCatalogue || emperorCatalogue) applyCatalogue();
})();
