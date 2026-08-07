(() => {
  let catalogue =
    window.HKCinemaMCLCatalogue || null;

  const grid =
    document.querySelector("#movieGrid");

  const count =
    document.querySelector("#movieCount");

  if (!grid || !count) {
    return;
  }

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
    return (
      document.querySelector(".tab.active")
        ?.dataset.tab || "now"
    );
  }

  function getMCLMovies() {
    if (!catalogue) {
      return [];
    }

    return getActiveTab() === "coming"
      ? catalogue.coming || []
      : catalogue.now || [];
  }

  function providerBadges(labels) {
    return `
      <div class="provider-badges">
        ${labels
          .map(
            label =>
              `<span class="provider-badge provider-${label.toLowerCase()}">${escapeHtml(label)}</span>`
          )
          .join("")}
      </div>
    `;
  }

  function renderMCLCard(movie) {
    const title =
      movie.title?.zh ||
      movie.title?.en ||
      "未命名電影";

    const poster = movie.poster
      ? `
        <img
          src="${escapeHtml(movie.poster)}"
          alt="${escapeHtml(title)}"
          loading="lazy"
          onerror="
            this.style.display='none';
            this.parentElement.classList.add('poster-error');
          "
        >
      `
      : "";

    const upcomingBadge =
      getActiveTab() === "coming"
        ? `
          <div class="movie-badges">
            <span class="movie-badge coming">MCL 即將上映</span>
          </div>
        `
        : "";

    return `
      <article
        class="movie-card mcl-only-card"
        data-provider="mcl"
        data-source-id="${escapeHtml(movie.sourceId)}"
        data-booking-url="${escapeHtml(movie.bookingUrl || "") }"
        role="link"
        tabindex="0"
        aria-label="在 MCL 查看 ${escapeHtml(title)}"
      >
        <div class="movie-poster">
          ${poster}
          ${upcomingBadge}
          <div class="poster-placeholder">MCL</div>
        </div>

        <div class="movie-info">
          <h3>${escapeHtml(title)}</h3>
          ${providerBadges(["MCL"])}
        </div>
      </article>
    `;
  }

  function markMatchedCard(card) {
    if (
      card.querySelector(
        ".provider-badges[data-multi-provider]"
      )
    ) {
      return;
    }

    const info =
      card.querySelector(".movie-info");

    if (!info) {
      return;
    }

    const wrapper =
      document.createElement("div");

    wrapper.innerHTML =
      providerBadges(["Broadway", "MCL"]);

    const badges = wrapper.firstElementChild;
    badges.dataset.multiProvider = "true";
    info.appendChild(badges);
  }

  function applyCatalogue() {
    if (!catalogue) {
      return;
    }

    // Wait until the main Broadway renderer has completed.
    if (count.textContent.trim() === "—") {
      return;
    }

    observer.disconnect();

    try {
      grid
        .querySelectorAll(".mcl-only-card")
        .forEach(card => card.remove());

      grid
        .querySelectorAll(
          ".provider-badges[data-multi-provider]"
        )
        .forEach(item => item.remove());

      const broadwayCards =
        Array.from(
          grid.querySelectorAll(
            ".movie-card:not(.mcl-only-card)"
          )
        );

      const byTitle = new Map();

      for (const card of broadwayCards) {
        const title =
          card.querySelector("h3")?.textContent;
        const key = normalizeTitle(title);

        if (key && !byTitle.has(key)) {
          byTitle.set(key, card);
        }
      }

      let added = 0;
      let matched = 0;

      for (const movie of getMCLMovies()) {
        const key = normalizeTitle(
          movie.title?.zh || movie.title?.en
        );

        if (!key) {
          continue;
        }

        const matchingCard = byTitle.get(key);

        if (matchingCard) {
          markMatchedCard(matchingCard);
          matched++;
          continue;
        }

        grid.insertAdjacentHTML(
          "beforeend",
          renderMCLCard(movie)
        );
        added++;
      }

      const total =
        broadwayCards.length + added;

      count.textContent = `${total} 部`;
      count.title =
        `合併後 ${total} 部 · 跨院線配對 ${matched} 部`;
    } finally {
      observer.observe(grid, {
        childList: true,
        subtree: true
      });
    }
  }

  let queued = false;

  const observer = new MutationObserver(() => {
    if (queued) {
      return;
    }

    queued = true;

    queueMicrotask(() => {
      queued = false;
      applyCatalogue();
    });
  });

  observer.observe(grid, {
    childList: true,
    subtree: true
  });

  window.addEventListener(
    "hkcinema:mcl-catalogue",
    event => {
      catalogue = event.detail;
      applyCatalogue();
    }
  );

  document.addEventListener(
    "click",
    event => {
      const card =
        event.target.closest(".mcl-only-card");

      if (!card) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const url = card.dataset.bookingUrl;

      if (url) {
        window.open(
          url,
          "_blank",
          "noopener,noreferrer"
        );
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }

      const card =
        event.target.closest(".mcl-only-card");

      if (!card) {
        return;
      }

      event.preventDefault();

      const url = card.dataset.bookingUrl;

      if (url) {
        window.open(
          url,
          "_blank",
          "noopener,noreferrer"
        );
      }
    }
  );

  if (catalogue) {
    applyCatalogue();
  }
})();
