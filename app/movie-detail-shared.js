(() => {
  const providers = {
    broadway: {
      label: "Broadway",
      eyebrow: "BROADWAY",
      fallback: "Broadway 戲院",
      seatAvailableLabel: "可選",
      note: "座位摘要及唯讀座位圖來自 Broadway 官方資料；實際選位、鎖位、付款及最終庫存以官方網站為準。"
    },
    mcl: {
      label: "MCL",
      eyebrow: "MCL CINEMA",
      fallback: "MCL 戲院",
      seatAvailableLabel: "可選",
      note: "未載入完整座位圖前，已售百分比只屬 MCL 來源估算；實際選位、鎖位、付款及最終庫存以官方網站為準。"
    },
    emperor: {
      label: "Emperor Cinemas",
      eyebrow: "EMPEROR CINEMAS",
      fallback: "Emperor Cinemas",
      seatAvailableLabel: "未售",
      note: "Emperor 的未售數字不會被推測為保證可選；實際選位、鎖位、付款及最終庫存以官方網站為準。"
    }
  };

  let returnFocus = null;

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
    if (Number.isNaN(date.getTime())) return String(dateString);
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

  function stripMarkup(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (typeof document === "undefined") return source.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const container = document.createElement("div");
    container.innerHTML = source;
    return (container.textContent || "").trim();
  }

  function providerCopy(providerId) {
    const copy = providers[String(providerId || "").toLowerCase()];
    if (!copy) throw new Error(`Unsupported detail provider: ${providerId}`);
    return copy;
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
      <aside class="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="sharedMovieDetailTitle">
        <button class="detail-close" type="button" data-detail-close aria-label="關閉電影詳情">×</button>
        <div id="movieDetailContent"></div>
      </aside>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function close({ restoreFocus = true } = {}) {
    const overlay = document.querySelector("#movieDetailOverlay");
    if (!overlay || overlay.hidden) return false;
    const provider = overlay.dataset.detailProvider || null;
    overlay.hidden = true;
    delete overlay.dataset.detailProvider;
    document.body.classList.remove("detail-open");
    window.dispatchEvent(new CustomEvent("hkcinema:movie-detail-close", {
      detail: { provider }
    }));
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
    if (restoreFocus) returnFocus = null;
    return true;
  }

  function priceDetails(showtime, providerId) {
    const price = showtime.price || {};
    const parts = [];
    if (providerId === "mcl") {
      [
        ["成人", price.adult],
        ["學生", price.student],
        ["小童", price.child],
        ["長者", price.senior]
      ].forEach(([label, value]) => {
        if (Number.isFinite(value)) parts.push(`${label} ${formatPrice(value)}`);
      });
    } else {
      if (Number.isFinite(price.face)) parts.push(`票面 ${formatPrice(price.face)}`);
      if (Number.isFinite(price.serviceFee)) parts.push(`手續費 ${formatPrice(price.serviceFee)}`);
      if (Number.isFinite(price.lowest) && price.lowest !== price.primary) {
        parts.push(`最低 ${formatPrice(price.lowest)}`);
      }
    }
    return parts;
  }

  function seatSummary(showtime, providerId) {
    const summary = showtime.seats || {};
    if (showtime.purchase?.canPurchase === false) {
      return { text: "暫不可購", tone: "unknown" };
    }

    if (
      ["exact", "provider-summary"].includes(summary.quality) &&
      Number.isFinite(summary.available) &&
      Number.isFinite(summary.total)
    ) {
      const ratio = summary.total > 0 ? summary.available / summary.total : 0;
      return {
        text: `${summary.available}/${summary.total} ${providerCopy(providerId).seatAvailableLabel}`,
        tone: ratio <= 0 ? "full" : ratio <= 0.12 ? "limited" : "available"
      };
    }

    if (summary.quality === "estimated" && Number.isFinite(summary.occupiedPercent)) {
      const percent = Math.round(summary.occupiedPercent);
      return {
        text: `約 ${percent}% 已售`,
        tone: percent >= 90 ? "full" : percent >= 70 ? "limited" : "available"
      };
    }

    return { text: "座位資料稍後提供", tone: "unknown" };
  }

  function factRows(movie) {
    const facts = movie.facts || {};
    return [
      ["上映日", facts.releaseDate ? formatDate(facts.releaseDate) : null],
      ["片長", Number.isFinite(facts.durationMinutes) ? `${facts.durationMinutes} 分鐘` : null],
      ["級別", facts.classification],
      ["類型", facts.category],
      ["語言", facts.languages?.length ? facts.languages.join("、") : null],
      ["字幕", facts.subtitles?.length ? facts.subtitles.join("、") : null],
      ["版本", facts.formats?.length ? facts.formats.join("、") : null]
    ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  }

  function groupShowtimes(showtimes) {
    const groups = new Map();
    for (const showtime of showtimes) {
      const key = showtime.cinema?.id || showtime.cinema?.sourceId || showtime.cinema?.name?.display || "unknown";
      if (!groups.has(key)) groups.set(key, { cinema: showtime.cinema, showtimes: [] });
      groups.get(key).showtimes.push(showtime);
    }
    for (const group of groups.values()) {
      group.showtimes.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    }
    return Array.from(groups.values()).sort((a, b) =>
      String(a.cinema?.name?.display || "").localeCompare(String(b.cinema?.name?.display || ""), "zh-HK")
    );
  }

  function createView(config = {}) {
    const providerId = String(config.providerId || "").toLowerCase();
    const vm = window.HKCinemaViewModels;
    if (!vm) throw new Error("HKCinemaViewModels is required before the shared detail renderer");
    const copy = providerCopy(providerId);
    const movie = vm.movie(providerId, config.movie || {}, config.detail || null);
    const shows = config.shows || null;
    const rawSessions = Array.isArray(shows?.sessions) ? shows.sessions : [];
    const showtimes = rawSessions.map(session => vm.showtime(providerId, session));

    return {
      providerId,
      copy,
      movie,
      dates: Array.isArray(shows?.availableDates) ? shows.availableDates : [],
      selectedDate: shows?.selectedDate || null,
      showtimes,
      groups: groupShowtimes(showtimes),
      hasShows: Boolean(shows),
      showtimesLoading: Boolean(config.showtimesLoading),
      showtimesError: config.showtimesError ? String(config.showtimesError) : null,
      detailLoading: Boolean(config.detailLoading),
      detailError: config.detailError ? String(config.detailError) : null,
      retryable: config.retryable !== false
    };
  }

  function renderHero(view) {
    const { movie, copy, providerId } = view;
    const poster = movie.posterUrl
      ? `<img src="${escapeHtml(movie.posterUrl)}" alt="${escapeHtml(movie.title.display)}">`
      : `<div class="detail-poster-placeholder">${escapeHtml(copy.label)}</div>`;
    const detailStatus = view.detailLoading
      ? `<p class="shared-detail-status" role="status">正在補充電影資料…</p>`
      : view.detailError
        ? `<p class="shared-detail-status warning">部分電影資料暫時未能更新。</p>`
        : "";

    return `
      <div class="detail-hero shared-detail-hero">
        <div class="detail-poster">${poster}</div>
        <div class="detail-title">
          <p class="eyebrow shared-provider-label">${escapeHtml(copy.eyebrow)}</p>
          <h1 id="sharedMovieDetailTitle">${escapeHtml(movie.title.display)}</h1>
          ${movie.title.secondary ? `<p class="detail-title-en">${escapeHtml(movie.title.secondary)}</p>` : ""}
          ${detailStatus}
          <div class="shared-detail-actions">
            <a class="detail-action shared-official-action" href="${escapeHtml(movie.bookingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.label)} 官方購票</a>
            ${movie.trailerUrl ? `<a class="shared-secondary-action" href="${escapeHtml(movie.trailerUrl)}" target="_blank" rel="noopener noreferrer">觀看預告</a>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  function renderFacts(view) {
    const facts = factRows(view.movie);
    if (!facts.length) return "";
    return `
      <dl class="shared-detail-facts">
        ${facts.map(([label, value]) => `
          <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
        `).join("")}
      </dl>
    `;
  }

  function renderPeople(view) {
    const rows = [
      ["導演", view.movie.people?.directors],
      ["演員", view.movie.people?.cast]
    ].filter(([, values]) => Array.isArray(values) && values.length);
    if (!rows.length) return "";
    return `
      <section class="shared-detail-people" aria-label="電影製作人員">
        ${rows.map(([label, values]) => `
          <div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(values.join("、"))}</p></div>
        `).join("")}
      </section>
    `;
  }

  function renderShowtime(showtime, view) {
    const summary = seatSummary(showtime, view.providerId);
    const details = priceDetails(showtime, view.providerId);
    const metadata = [
      showtime.house?.name,
      ...(showtime.metadata?.formats || []),
      ...(showtime.metadata?.languages || []),
      ...(showtime.metadata?.subtitles || [])
    ].filter(Boolean);
    const providerClass = view.providerId === "mcl"
      ? "mcl-showtime-card"
      : view.providerId === "emperor"
        ? "emperor-showtime-card"
        : "broadway-showtime-card";
    const priceClass = view.providerId === "mcl"
      ? "mcl-ticket-prices"
      : view.providerId === "emperor"
        ? "emperor-ticket-prices"
        : "";

    return `
      <article
        class="showtime-card shared-showtime-card ${providerClass}"
        data-detail-provider="${escapeHtml(view.providerId)}"
        data-showtime-id="${escapeHtml(showtime.sourceId || "")}"
        data-booking-url="${escapeHtml(showtime.bookingUrl || view.movie.bookingUrl)}"
      >
        <div class="shared-showtime-primary">
          <strong class="showtime-time">${escapeHtml(showtime.time || "--:--")}</strong>
        </div>
        <div class="shared-showtime-info">
          <p class="shared-showtime-metadata">${escapeHtml(metadata.join(" · ") || view.copy.label)}</p>
          ${details.length ? `<p class="shared-ticket-prices ${priceClass}">${escapeHtml(details.join(" · "))}</p>` : ""}
        </div>
        <div class="showtime-side">
          <strong class="showtime-price">${escapeHtml(formatPrice(showtime.price?.primary))}</strong>
          <span class="shared-seat-summary ${summary.tone}">${escapeHtml(summary.text)}</span>
        </div>
        <div class="shared-showtime-actions">
          ${showtime.seatMap?.supported ? `<button type="button" class="seat-pill shared-seatmap-button">查看座位</button>` : ""}
          <a class="shared-booking-button" href="${escapeHtml(showtime.bookingUrl || view.movie.bookingUrl)}" target="_blank" rel="noopener noreferrer">官方購票</a>
        </div>
      </article>
    `;
  }

  function renderDates(view) {
    if (!view.dates.length) return "";
    return `
      <div class="detail-dates" aria-label="選擇場次日期">
        ${view.dates.map(date => `
          <button
            type="button"
            class="detail-date ${date === view.selectedDate ? "active" : ""}"
            data-detail-provider="${escapeHtml(view.providerId)}"
            data-detail-date="${escapeHtml(date)}"
            aria-pressed="${date === view.selectedDate ? "true" : "false"}"
          >${escapeHtml(formatDate(date))}</button>
        `).join("")}
      </div>
    `;
  }

  function renderState(title, message, view, role = "status") {
    return `
      <div class="detail-state" role="${role}" aria-live="polite">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
        ${view.retryable && role === "alert" ? `<button type="button" class="detail-action shared-detail-retry" data-detail-provider="${escapeHtml(view.providerId)}" data-detail-retry>重新載入</button>` : ""}
      </div>
    `;
  }

  function renderShowtimes(view) {
    if (view.showtimesLoading && !view.hasShows) {
      return renderState(`正在載入 ${view.copy.label} 場次`, "正在取得可售日期、戲院、票價及座位摘要…", view);
    }
    if (view.showtimesError && !view.hasShows) {
      return renderState(`暫時無法取得 ${view.copy.label} 場次`, view.showtimesError, view, "alert");
    }
    if (!view.hasShows) {
      return renderState("暫時沒有可售場次", `${view.copy.label} 尚未提供此電影的可售場次。`, view);
    }

    const groups = view.groups.length
      ? view.groups.map(group => `
          <section class="cinema-group">
            <div class="cinema-group-heading">
              <h3>${escapeHtml(group.cinema?.name?.display || view.copy.fallback)}</h3>
              <span>${group.showtimes.length} 場</span>
            </div>
            <div class="showtime-list">${group.showtimes.map(showtime => renderShowtime(showtime, view)).join("")}</div>
          </section>
        `).join("")
      : `<div class="detail-state compact"><strong>這一天沒有場次</strong><span>請選擇其他日期。</span></div>`;

    return `
      ${renderDates(view)}
      ${view.showtimesLoading ? `<p class="shared-shows-status" role="status">正在更新場次…</p>` : ""}
      ${view.showtimesError ? `<p class="shared-shows-status warning" role="alert">場次更新失敗，現正顯示最近一次可用資料。</p>` : ""}
      <div class="detail-section-heading">
        <h2>場次</h2>
        <span>${view.showtimes.length} 場</span>
      </div>
      ${groups}
      <p class="shared-session-note">${escapeHtml(view.copy.note)}</p>
    `;
  }

  function renderHtml(view) {
    const rawDescription = String(view.movie.description || "");
    const description = view.providerId === "broadway" && /^\$/.test(rawDescription)
      ? ""
      : stripMarkup(rawDescription);
    return `
      <div class="shared-movie-detail" data-detail-provider="${escapeHtml(view.providerId)}">
        ${renderHero(view)}
        ${renderFacts(view)}
        ${renderPeople(view)}
        ${description ? `<section class="detail-description"><h2>電影簡介</h2><p>${escapeHtml(description)}</p></section>` : ""}
        <section class="detail-showtimes" aria-busy="${view.showtimesLoading ? "true" : "false"}">
          ${renderShowtimes(view)}
        </section>
      </div>
    `;
  }

  function render(config) {
    const view = createView(config);
    const overlay = ensureOverlay();
    const previousProvider = overlay.dataset.detailProvider;
    if (!overlay.hidden && previousProvider && previousProvider !== view.providerId) {
      close({ restoreFocus: false });
    }
    const opening = overlay.hidden;
    if (opening && !returnFocus?.isConnected) returnFocus = document.activeElement;
    overlay.dataset.detailProvider = view.providerId;
    const content = overlay.querySelector("#movieDetailContent");
    content.innerHTML = renderHtml(view);
    overlay.hidden = false;
    document.body.classList.add("detail-open");
    if (opening) requestAnimationFrame(() => overlay.querySelector(".detail-close")?.focus());
    return view;
  }

  document.addEventListener("click", event => {
    if (event.target.closest?.("#movieDetailOverlay [data-detail-close]")) {
      event.preventDefault();
      close();
    }
  });

  document.addEventListener("keydown", event => {
    const overlay = document.querySelector("#movieDetailOverlay");
    if (!overlay || overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(overlay.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.HKCinemaMovieDetail = Object.freeze({
    version: "7b2",
    createView,
    renderHtml,
    render,
    close,
    ensureOverlay,
    activeProvider() {
      const overlay = document.querySelector("#movieDetailOverlay");
      return overlay && !overlay.hidden ? overlay.dataset.detailProvider || null : null;
    }
  });
})();
