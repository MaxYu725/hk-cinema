(() => {
  let mclCatalogue = window.HKCinemaMCLCatalogue || null;
  let emperorCatalogue = window.HKCinemaEmperorCatalogue || null;

  const grid = document.querySelector("#movieGrid");
  const count = document.querySelector("#movieCount");

  if (!grid || !count) return;

  const matchRecords = new Map();

  window.HKCinemaProviderMatches = {
    get(id) {
      return matchRecords.get(String(id)) || null;
    },
    all() {
      return Array.from(matchRecords.values());
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

  function normalizeTitle(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[《》「」『』【】〔〕〈〉<>]/g, "")
      .replace(/[·・:：\-–—_.,，。!?！？'"`]/g, "")
      .replace(/\s+/g, "")
      .trim();
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

  function providerBadges(labels, options = {}) {
    const {
      mclSourceId = null,
      emperorSourceId = null,
      matchId = null
    } = options;

    const compareLabel = labels.length >= 3
      ? "比較 Broadway、MCL 與 Emperor 場次及票價"
      : `比較 ${labels.join(" 與 ")} 場次及票價`;

    return `
      <div class="provider-badges" data-multi-provider="true">
        ${labels.map(label => {
          const key = label.toLowerCase();
          let attrs = "";

          if (label === "MCL" && mclSourceId) {
            attrs = ` data-mcl-open="${escapeHtml(mclSourceId)}" title="查看 MCL 場次"`;
          } else if (label === "Emperor" && emperorSourceId) {
            attrs = ` data-emperor-open="${escapeHtml(emperorSourceId)}" title="查看 Emperor 場次"`;
          }

          return `<span class="provider-badge provider-${key}"${attrs}>${escapeHtml(label)}</span>`;
        }).join("")}
        ${matchId
          ? `<button type="button" class="provider-compare" data-compare-open="${escapeHtml(matchId)}" aria-label="${escapeHtml(compareLabel)}">比較</button>`
          : ""}
      </div>
    `;
  }

  function movieTitle(movie) {
    return movie?.title?.zh || movie?.title?.en || "未命名電影";
  }

  function renderProviderOnlyCard(movie, provider) {
    const title = movieTitle(movie);
    const isMCL = provider === "mcl";
    const label = isMCL ? "MCL" : "Emperor";
    const providerClass = isMCL ? "mcl-only-card" : "emperor-only-card";
    const openAttr = isMCL
      ? `data-mcl-open="${escapeHtml(movie.sourceId)}"`
      : `data-emperor-open="${escapeHtml(movie.sourceId)}"`;
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
          <span class="movie-badge coming">${label} 即將上映</span>
        </div>
      `
      : "";

    return `
      <article
        class="movie-card ${providerClass}"
        data-provider="${provider}"
        data-source-id="${escapeHtml(movie.sourceId)}"
        data-booking-url="${escapeHtml(movie.bookingUrl || "")}"
        ${openAttr}
        role="button"
        tabindex="0"
        aria-label="查看 ${label} ${escapeHtml(title)} 詳情及場次"
      >
        <div class="movie-poster">
          ${poster}
          ${upcomingBadge}
          <div class="poster-placeholder">${label}</div>
        </div>
        <div class="movie-info">
          <h3>${escapeHtml(title)}</h3>
          ${providerBadges([label], {
            mclSourceId: isMCL ? movie.sourceId : null,
            emperorSourceId: isMCL ? null : movie.sourceId
          })}
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

  function buildMatchRecord(card) {
    const data = cardProviderData(card);
    const components = [];

    if (data.broadwaySourceId) {
      components.push(`broadway:${data.broadwaySourceId}`);
    }
    if (data.mclSourceId) {
      components.push(`mcl:${data.mclSourceId}`);
    }
    if (data.emperorSourceId) {
      components.push(`emperor:${data.emperorSourceId}`);
    }

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

  function refreshCardBadges(card) {
    const info = card.querySelector(".movie-info");
    if (!info) return;

    info.querySelector(".provider-badges[data-multi-provider]")?.remove();
    const labels = cardProviders(card);
    const data = cardProviderData(card);
    const matchId = card.dataset.providerMatchId || null;

    info.insertAdjacentHTML("beforeend", providerBadges(labels, {
      mclSourceId: data.mclSourceId || null,
      emperorSourceId: data.emperorSourceId || null,
      matchId
    }));
  }

  function openMCL(sourceId) {
    const movie = findMCLMovie(sourceId);
    if (!movie) return false;
    const detail = window.HKCinemaMCLDetail;
    if (detail?.open) return detail.open(movie) !== false;
    window.dispatchEvent(new CustomEvent("hkcinema:mcl-open", { detail: { movie } }));
    return true;
  }

  function openEmperor(sourceId) {
    const movie = findEmperorMovie(sourceId);
    if (!movie) return false;

    if (window.HKCinemaEmperorDetail?.open) {
      return window.HKCinemaEmperorDetail.open(movie) !== false;
    }

    const url = movie.bookingUrl || "https://www.emperorcinemas.com/showtimes";
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }

  function applyCatalogue() {
    if (!mclCatalogue && !emperorCatalogue) return;
    if (count.textContent.trim() === "—") return;

    observer.disconnect();

    try {
      matchRecords.clear();

      grid.querySelectorAll(".mcl-only-card, .emperor-only-card").forEach(card => card.remove());
      grid.querySelectorAll(".provider-badges[data-multi-provider]").forEach(item => item.remove());
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
        if (record) {
          matched++;
          if (record.broadway && record.mcl && record.emperor) {
            tripleMatched++;
          }
        }
        refreshCardBadges(card);
      }

      const total = grid.querySelectorAll(".movie-card").length;
      count.textContent = `${total} 部`;
      count.title = `合併後 ${total} 部 · 跨院線配對 ${matched} 部 · 三院線配對 ${tripleMatched} 部`;

      window.dispatchEvent(new CustomEvent("hkcinema:provider-matches", {
        detail: {
          matches: Array.from(matchRecords.values()),
          count: matchRecords.size,
          tripleMatched
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

  document.addEventListener("click", event => {
    const mclTarget = event.target.closest("[data-mcl-open]");
    if (mclTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openMCL(mclTarget.dataset.mclOpen || mclTarget.dataset.sourceId);
      return;
    }

    const emperorTarget = event.target.closest("[data-emperor-open]");
    if (emperorTarget) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openEmperor(emperorTarget.dataset.emperorOpen || emperorTarget.dataset.sourceId);
    }
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const mclCard = event.target.closest(".mcl-only-card");
    if (mclCard) {
      event.preventDefault();
      openMCL(mclCard.dataset.sourceId);
      return;
    }

    const emperorCard = event.target.closest(".emperor-only-card");
    if (emperorCard) {
      event.preventDefault();
      openEmperor(emperorCard.dataset.sourceId);
    }
  });

  if (mclCatalogue || emperorCatalogue) applyCatalogue();
})();