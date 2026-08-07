(() => {
  const state = {
    movie: null,
    ticketing: null,
    loading: false,
    error: null
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(`${dateString}T00:00:00+08:00`);

    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return new Intl.DateTimeFormat(
      "zh-HK",
      {
        timeZone: "Asia/Hong_Kong",
        month: "numeric",
        day: "numeric",
        weekday: "short"
      }
    ).format(date);
  }

  function getOverlay() {
    return document.querySelector("#movieDetailOverlay");
  }

  function getContent() {
    return document.querySelector("#movieDetailContent");
  }

  function groupSessionsByCinema(sessions) {
    const groups = new Map();

    for (const session of sessions || []) {
      const key =
        session.cinema?.id ||
        session.cinema?.name?.zh ||
        "unknown";

      if (!groups.has(key)) {
        groups.set(key, {
          cinema: session.cinema,
          sessions: []
        });
      }

      groups.get(key).sessions.push(session);
    }

    for (const group of groups.values()) {
      group.sessions.sort((a, b) =>
        String(a.time || "").localeCompare(String(b.time || ""))
      );
    }

    return Array.from(groups.values()).sort((a, b) =>
      String(a.cinema?.name?.zh || "")
        .localeCompare(
          String(b.cinema?.name?.zh || ""),
          "zh-HK"
        )
    );
  }

  function renderPriceLine(session) {
    const prices = [
      ["成人", session.price?.adult],
      ["學生", session.price?.student],
      ["小童", session.price?.child],
      ["長者", session.price?.senior]
    ].filter(([, value]) => Number.isFinite(value));

    if (!prices.length) return "";

    return `
      <p class="mcl-ticket-prices">
        ${prices
          .map(([label, value]) =>
            `${escapeHtml(label)} $${escapeHtml(value)}`
          )
          .join(" · ")}
      </p>
    `;
  }

  function renderSession(session) {
    const adultPrice = session.price?.adult;
    const occupied = session.seatSummary?.occupiedPercent;

    let occupancyText = "座位資料稍後提供";
    let occupancyClass = "unknown";

    if (Number.isFinite(occupied)) {
      occupancyText = `約 ${Math.round(occupied)}% 已售`;

      if (occupied >= 90) {
        occupancyClass = "full";
      } else if (occupied >= 70) {
        occupancyClass = "limited";
      } else {
        occupancyClass = "available";
      }
    }

    const secondary = [
      session.house?.name,
      session.format,
      session.language
    ].filter(Boolean);

    return `
      <a
        class="showtime-card mcl-showtime-card"
        href="${escapeHtml(session.bookingUrl || "#")}" 
        target="_blank"
        rel="noopener noreferrer"
      >
        <div>
          <strong class="showtime-time">${escapeHtml(session.time || "--:--")}</strong>
          <p>${escapeHtml(secondary.join(" · ") || "MCL")}</p>
          ${renderPriceLine(session)}
        </div>

        <div class="showtime-side">
          ${
            Number.isFinite(adultPrice)
              ? `<strong class="showtime-price">$${escapeHtml(adultPrice)}</strong>`
              : `<strong class="showtime-price">—</strong>`
          }
          <span class="seat-pill ${occupancyClass}">${escapeHtml(occupancyText)}</span>
        </div>
      </a>
    `;
  }

  function render() {
    const overlay = getOverlay();
    const content = getContent();

    if (!overlay || !content || !state.movie) {
      return;
    }

    overlay.hidden = false;
    document.body.classList.add("detail-open");

    const movie = state.movie;
    const title =
      movie.title?.zh ||
      movie.title?.en ||
      "未命名電影";

    const poster = movie.poster
      ? `<img src="${escapeHtml(movie.poster)}" alt="${escapeHtml(title)}">`
      : `<div class="detail-poster-placeholder">MCL</div>`;

    let bodyHtml = "";

    if (state.loading) {
      bodyHtml = `
        <div class="detail-state">
          <strong>正在載入 MCL 場次</strong>
          <span>正在取得日期、戲院及票價...</span>
        </div>
      `;
    } else if (state.error) {
      bodyHtml = `
        <div class="detail-state">
          <strong>暫時無法取得 MCL 場次</strong>
          <span>${escapeHtml(state.error)}</span>
          ${
            movie.bookingUrl
              ? `<a class="detail-action mcl-fallback-link" href="${escapeHtml(movie.bookingUrl)}" target="_blank" rel="noopener noreferrer">前往 MCL 官網</a>`
              : ""
          }
        </div>
      `;
    } else if (!state.ticketing) {
      bodyHtml = `
        <div class="detail-state">
          <strong>暫時沒有可售場次</strong>
          <span>MCL 尚未提供此電影的可售場次。</span>
        </div>
      `;
    } else {
      const dates = state.ticketing.availableDates || [];
      const sessions = state.ticketing.sessions || [];
      const groups = groupSessionsByCinema(sessions);

      const dateHtml = dates.length
        ? `
          <div class="detail-dates">
            ${dates.map(date => `
              <button
                type="button"
                class="detail-date ${date === state.ticketing.selectedDate ? "active" : ""}"
                data-mcl-detail-date="${escapeHtml(date)}"
              >
                ${escapeHtml(formatDate(date))}
              </button>
            `).join("")}
          </div>
        `
        : "";

      const showsHtml = groups.length
        ? groups.map(group => {
            const cinemaName =
              group.cinema?.name?.zh ||
              "MCL 戲院";

            return `
              <section class="cinema-group">
                <div class="cinema-group-heading">
                  <h3>${escapeHtml(cinemaName)}</h3>
                  <span>${group.sessions.length} 場</span>
                </div>
                <div class="showtime-list">
                  ${group.sessions.map(renderSession).join("")}
                </div>
              </section>
            `;
          }).join("")
        : `
          <div class="detail-state compact">
            <strong>這一天沒有場次</strong>
            <span>請選擇其他日期。</span>
          </div>
        `;

      bodyHtml = `
        ${dateHtml}
        <div class="detail-section-heading">
          <h2>MCL 場次</h2>
          <span>${sessions.length} 場</span>
        </div>
        ${showsHtml}
        <p class="mcl-session-note">
          成人票價直接顯示於右側；學生、小童及長者票價列於場次下方。座位百分比為 MCL 提供的入座概況，完整座位圖會在下一階段接入。
        </p>
      `;
    }

    content.innerHTML = `
      <div class="detail-hero">
        <div class="detail-poster">${poster}</div>

        <div class="detail-title">
          <p class="eyebrow">MCL CINEMA</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="detail-meta">MCL 電影</p>
          ${
            movie.bookingUrl
              ? `<a class="detail-action" href="${escapeHtml(movie.bookingUrl)}" target="_blank" rel="noopener noreferrer">MCL 官方頁</a>`
              : ""
          }
        </div>
      </div>

      <section class="detail-showtimes">
        ${bodyHtml}
      </section>
    `;
  }

  async function load(movie, selectedDate = null) {
    const provider = window.HKCinemaProviders?.mcl;

    state.movie = movie;
    state.loading = true;
    state.error = null;
    state.ticketing = null;

    // Open the drawer immediately before any MCL network request.
    // This gives mobile users instant feedback even when a VPN makes MCL slow.
    render();

    if (!provider?.getTicketing) {
      state.loading = false;
      state.error = "MCL ticketing provider 未能載入。";
      render();
      return;
    }

    try {
      state.ticketing = await provider.getTicketing(
        movie.sourceId,
        selectedDate
      );
    } catch (error) {
      state.error =
        error?.name === "AbortError"
          ? "MCL 場次連線逾時，請稍後再試。"
          : error instanceof Error
            ? error.message
            : String(error);
    } finally {
      state.loading = false;
      render();
    }
  }

  function close() {
    const overlay = getOverlay();

    if (overlay) {
      overlay.hidden = true;
    }

    document.body.classList.remove("detail-open");
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

  window.addEventListener(
    "hkcinema:mcl-open",
    event => {
      const movie = event.detail?.movie;
      if (movie) load(movie);
    }
  );

  document.addEventListener(
    "click",
    event => {
      const dateButton =
        event.target.closest("[data-mcl-detail-date]");

      if (!dateButton || !state.movie) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      load(
        state.movie,
        dateButton.dataset.mclDetailDate
      );
    },
    true
  );

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      state.movie &&
      !getOverlay()?.hidden
    ) {
      close();
    }
  });
})();
