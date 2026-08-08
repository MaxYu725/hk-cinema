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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stripHtml(value) {
    const container = document.createElement("div");
    container.innerHTML = String(value || "");
    return (container.textContent || "").trim();
  }

  function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(`${dateString}T00:00:00+08:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      month: "numeric",
      day: "numeric",
      weekday: "short"
    }).format(date);
  }

  function formatPrice(value) {
    return Number.isFinite(value) ? `$${value}` : "—";
  }

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
    if (map.size > 48) {
      const first = map.keys().next().value;
      map.delete(first);
    }
  }

  function ensureOverlay() {
    let overlay = document.querySelector("#movieDetailOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "movieDetailOverlay";
    overlay.className = "detail-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="detail-backdrop" data-detail-close></div>
      <aside class="detail-drawer" role="dialog" aria-modal="true" aria-label="電影詳情">
        <button class="detail-close" type="button" data-detail-close aria-label="關閉電影詳情">×</button>
        <div id="movieDetailContent"></div>
      </aside>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function getContent() {
    ensureOverlay();
    return document.querySelector("#movieDetailContent");
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

  function groupSessionsByCinema(sessions) {
    const groups = new Map();
    for (const session of sessions || []) {
      const key = session.cinema?.sourceId || session.cinema?.name?.zh || "unknown";
      if (!groups.has(key)) {
        groups.set(key, { cinema: session.cinema, sessions: [] });
      }
      groups.get(key).sessions.push(session);
    }
    for (const group of groups.values()) {
      group.sessions.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    }
    return Array.from(groups.values()).sort((a, b) =>
      String(a.cinema?.name?.zh || "").localeCompare(String(b.cinema?.name?.zh || ""), "zh-HK")
    );
  }

  function renderSeatSummary(session) {
    const summary = session.seatSummary || {};
    const total = Number(summary.total);
    const sold = Number(summary.sold);
    const available = Number(summary.available);

    if (session.purchase?.canPurchase === false) {
      return { text: "暫不可購", className: "unknown" };
    }
    if (Number.isFinite(total) && Number.isFinite(sold) && Number.isFinite(available) && total > 0) {
      const ratio = available / total;
      return {
        text: `約 ${available}/${total} 未售`,
        className: ratio <= 0.08 ? "full" : ratio <= 0.25 ? "limited" : "available"
      };
    }
    return { text: "座位資料暫缺", className: "unknown" };
  }

  function renderPriceDetails(session) {
    const face = session.price?.face;
    const fee = session.price?.serviceFee;
    const lowest = session.price?.lowest;
    const parts = [];
    if (Number.isFinite(face)) parts.push(`票面 ${formatPrice(face)}`);
    if (Number.isFinite(fee)) parts.push(`手續費 ${formatPrice(fee)}`);
    if (Number.isFinite(lowest) && lowest !== session.price?.display) parts.push(`最低 ${formatPrice(lowest)}`);
    return parts.length ? `<p class="emperor-ticket-prices">${escapeHtml(parts.join(" · "))}</p>` : "";
  }

  function renderSession(session) {
    const seat = renderSeatSummary(session);
    const secondary = [
      session.house?.name,
      session.format,
      session.language,
      session.subtitle ? `字幕：${session.subtitle}` : null
    ].filter(Boolean);
    const price = session.price?.display;

    return `
      <a class="showtime-card emperor-showtime-card" href="${escapeHtml(session.bookingUrl || state.movie?.bookingUrl || "https://www.emperorcinemas.com/showtimes")}" target="_blank" rel="noopener noreferrer">
        <div>
          <strong class="showtime-time">${escapeHtml(session.time || "--:--")}</strong>
          <p>${escapeHtml(secondary.join(" · ") || "Emperor Cinemas")}</p>
          ${renderPriceDetails(session)}
        </div>
        <div class="showtime-side">
          <strong class="showtime-price">${escapeHtml(formatPrice(price))}</strong>
          <span class="seat-pill ${seat.className}">${escapeHtml(seat.text)}</span>
        </div>
      </a>
    `;
  }

  function renderFacts(movie) {
    const facts = [
      ["上映", movie.releaseDate ? formatDate(movie.releaseDate) : null],
      ["片長", Number.isFinite(movie.durationMinutes) ? `${movie.durationMinutes} 分鐘` : null],
      ["級別", movie.classification || movie.rating || null],
      ["類型", movie.category || null],
      ["語言", movie.language || null],
      ["字幕", movie.subtitle || null],
      ["版本", Array.isArray(movie.formatGroups) && movie.formatGroups.length ? movie.formatGroups.join(" · ") : Array.isArray(movie.formats) ? movie.formats.join(" · ") : null]
    ].filter(([, value]) => value);

    if (!facts.length) return "";
    return `
      <dl class="emperor-facts">
        ${facts.map(([label, value]) => `
          <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
        `).join("")}
      </dl>
    `;
  }

  function renderPeople(movie) {
    const rows = [
      ["導演", movie.directors],
      ["演員", movie.cast]
    ].filter(([, value]) => value);
    if (!rows.length) return "";
    return `
      <section class="emperor-people">
        ${rows.map(([label, value]) => `
          <div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>
        `).join("")}
      </section>
    `;
  }

  function renderShows() {
    if (state.loadingShows && !state.shows) {
      return `
        <div class="detail-state" role="status" aria-live="polite">
          <strong>正在載入 Emperor 場次</strong>
          <span>正在取得可售日期、戲院及票價...</span>
        </div>
      `;
    }

    if (state.showsError && !state.shows) {
      return `
        <div class="detail-state" role="alert">
          <strong>暫時無法取得 Emperor 場次</strong>
          <span>${escapeHtml(state.showsError)}</span>
          <button type="button" class="detail-action emperor-retry" data-emperor-retry>重新載入</button>
        </div>
      `;
    }

    if (!state.shows) {
      return `
        <div class="detail-state">
          <strong>暫時沒有可售場次</strong>
          <span>Emperor 尚未提供此電影的可售場次。</span>
        </div>
      `;
    }

    const dates = state.shows.availableDates || [];
    const sessions = state.shows.sessions || [];
    const groups = groupSessionsByCinema(sessions);
    const dateHtml = dates.length ? `
      <div class="detail-dates emperor-detail-dates">
        ${dates.map(date => `
          <button type="button" class="detail-date ${date === state.shows.selectedDate ? "active" : ""}" data-emperor-detail-date="${escapeHtml(date)}">
            ${escapeHtml(formatDate(date))}
          </button>
        `).join("")}
      </div>
    ` : "";
    const groupsHtml = groups.length ? groups.map(group => `
      <section class="cinema-group">
        <div class="cinema-group-heading">
          <h3>${escapeHtml(group.cinema?.name?.zh || "Emperor Cinemas")}</h3>
          <span>${group.sessions.length} 場</span>
        </div>
        <div class="showtime-list">${group.sessions.map(renderSession).join("")}</div>
      </section>
    `).join("") : `
      <div class="detail-state compact">
        <strong>這一天沒有場次</strong>
        <span>請選擇其他日期。</span>
      </div>
    `;

    return `
      ${dateHtml}
      <div class="detail-section-heading">
        <h2>Emperor 場次</h2>
        <span>${sessions.length} 場</span>
      </div>
      ${groupsHtml}
      <p class="emperor-session-note">
        右側為 Emperor 場次顯示票價；如來源同時提供票面價及手續費，會列於場次下方。座位數只按戲院提供的總座位與已售數推算，並非即時可選座位圖。
      </p>
    `;
  }

  function render() {
    if (!state.movie) return;
    const overlay = ensureOverlay();
    const content = getContent();
    if (!content) return;

    overlay.hidden = false;
    document.body.classList.add("detail-open");

    const fallback = state.movie;
    const movie = state.detail || fallback;
    const title = movie.title?.zh || movie.title?.en || fallback.title?.zh || fallback.title?.en || "未命名電影";
    const titleEn = movie.title?.en && movie.title.en !== title ? movie.title.en : "";
    const posterUrl = movie.poster || fallback.poster;
    const poster = posterUrl
      ? `<img src="${escapeHtml(posterUrl)}" alt="${escapeHtml(title)}">`
      : `<div class="detail-poster-placeholder">Emperor</div>`;
    const bookingUrl = movie.bookingUrl || fallback.bookingUrl || "https://www.emperorcinemas.com/showtimes";
    const description = stripHtml(movie.description || "");

    const detailStatus = state.loadingDetail && !state.detail
      ? `<p class="emperor-detail-status">正在補充電影資料...</p>`
      : state.detailError && !state.detail
        ? `<p class="emperor-detail-status warning">部分電影資料暫時未能更新。</p>`
        : "";

    content.innerHTML = `
      <div class="detail-hero emperor-detail-hero">
        <div class="detail-poster">${poster}</div>
        <div class="detail-title">
          <p class="eyebrow">EMPEROR CINEMAS</p>
          <h1>${escapeHtml(title)}</h1>
          ${titleEn ? `<p class="detail-title-en">${escapeHtml(titleEn)}</p>` : ""}
          ${detailStatus}
          <a class="detail-action emperor-official-link" href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer">Emperor 官方購票</a>
        </div>
      </div>

      ${renderFacts(movie)}
      ${renderPeople(movie)}
      ${description ? `
        <section class="detail-description">
          <h2>電影簡介</h2>
          <p>${escapeHtml(description)}</p>
        </section>
      ` : ""}
      ${movie.trailer ? `
        <p><a class="emperor-trailer-link" href="${escapeHtml(movie.trailer)}" target="_blank" rel="noopener noreferrer">觀看官方預告</a></p>
      ` : ""}

      <section class="detail-showtimes" aria-busy="${state.loadingShows ? "true" : "false"}">
        ${renderShows()}
      </section>
    `;
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
    const dateButton = event.target.closest("[data-emperor-detail-date]");
    if (dateButton && state.movie) {
      event.preventDefault();
      event.stopPropagation();
      const generation = state.generation;
      loadShows(state.movie, dateButton.dataset.emperorDetailDate, generation);
      return;
    }

    const retry = event.target.closest("[data-emperor-retry]");
    if (retry && state.movie) {
      event.preventDefault();
      const generation = state.generation;
      const selectedDate = state.shows?.selectedDate || null;
      loadShows(state.movie, selectedDate, generation, true);
      return;
    }

    if (event.target.closest("[data-detail-close]") && state.movie) {
      close();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.movie && !ensureOverlay().hidden) {
      close();
    }
  });

  document.querySelector("#refreshButton")?.addEventListener("click", () => {
    detailCache.clear();
    showsCache.clear();
  });
})();
