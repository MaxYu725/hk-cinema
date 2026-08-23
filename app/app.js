const API_BASE =
  "https://hk-cinema-api.max-yu-jp.workers.dev";

const BROADWAY_CACHE_KEY = "hkcinema:broadway-catalogue:v1";
const BROADWAY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const state = {
  tab: "now",
  showingMovies: [],
  upcomingMovies: [],
  loading: true,
  errors: {
    now: null,
    coming: null
  },
  updatedAt: {
    now: null,
    coming: null
  },
  cache: {
    now: false,
    coming: false
  }
};

const elements = {
  tabs: document.querySelectorAll(".tab"),
  sectionTitle: document.querySelector("#sectionTitle"),
  movieCount: document.querySelector("#movieCount"),
  movieGrid: document.querySelector("#movieGrid"),
  refreshButton: document.querySelector("#refreshButton"),
  systemStatus: document.querySelector("#systemStatus")
};

function readBroadwayCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROADWAY_CACHE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return { now: null, coming: null };

    const validate = entry => {
      const savedAt = Number(entry?.savedAt);
      const age = Date.now() - savedAt;
      if (!Number.isFinite(savedAt) || age < 0 || age > BROADWAY_CACHE_MAX_AGE_MS) return null;
      if (!Array.isArray(entry?.data)) return null;
      return entry;
    };

    return {
      now: validate(parsed.now),
      coming: validate(parsed.coming)
    };
  } catch {
    return { now: null, coming: null };
  }
}

function writeBroadwayCache(entries) {
  try {
    if (!entries.now && !entries.coming) {
      localStorage.removeItem(BROADWAY_CACHE_KEY);
      return;
    }
    localStorage.setItem(BROADWAY_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
}

function oldestBroadwayUpdate() {
  const times = [state.updatedAt.now, state.updatedAt.coming]
    .map(value => Date.parse(value || ""))
    .filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function reportBroadway(status, source, detail) {
  window.HKCinemaDataHealth?.report?.("broadway", {
    status,
    source,
    updatedAt: oldestBroadwayUpdate(),
    detail
  });
}

function broadwayAgeText() {
  const updatedAt = oldestBroadwayUpdate();
  if (!updatedAt) return "尚未更新";
  return `${window.HKCinemaDataHealth?.formatAge?.(updatedAt) || "最近"}更新`;
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
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values
    .flatMap(item => String(item || "").split(/[、,，/;；]+/))
    .map(item => item.trim())
    .filter(Boolean)));
}

function metadataAttribute(value) {
  return escapeHtml(JSON.stringify(metadataValues(value)));
}

function setStatus(type, title, text) {
  const strong =
    elements.systemStatus.querySelector("strong");

  const paragraph =
    elements.systemStatus.querySelector("p");

  strong.textContent = title;
  paragraph.textContent = text;
  elements.systemStatus.dataset.status = type;
}

function setBroadwayGridState(value) {
  elements.movieGrid.dataset.broadwayState = value;
  delete elements.movieGrid.dataset.multiProviderEmpty;
}

function getNowShowingMovies() {
  return state.showingMovies
    .filter(movie => movie.status === "now-showing")
    .slice()
    .sort((a, b) =>
      (b.releaseDate || "0000-00-00")
        .localeCompare(a.releaseDate || "0000-00-00")
    );
}

function getPresaleMovies() {
  return state.showingMovies
    .filter(movie => movie.status === "presale")
    .slice()
    .sort((a, b) =>
      (a.releaseDate || "9999-12-31")
        .localeCompare(b.releaseDate || "9999-12-31")
    );
}

function getUpcomingMovies() {
  return state.upcomingMovies
    .slice()
    .sort((a, b) =>
      (a.releaseDate || "9999-12-31")
        .localeCompare(b.releaseDate || "9999-12-31")
    );
}

function getVisibleMovies() {
  return state.tab === "now"
    ? getNowShowingMovies()
    : getUpcomingMovies();
}

function getCurrentError() {
  const error = state.tab === "now"
    ? state.errors.now
    : state.errors.coming;
  const hasUsableData = state.tab === "now"
    ? state.showingMovies.length > 0 || state.cache.now
    : state.upcomingMovies.length > 0 || state.cache.coming;
  return hasUsableData ? null : error;
}

function getPresaleIds() {
  return new Set(
    getPresaleMovies().map(movie =>
      String(movie.sourceId || movie.id)
    )
  );
}

function renderLoading() {
  setBroadwayGridState("loading");
  elements.movieGrid.innerHTML = `
    <div class="empty-state">
      <strong>正在載入電影</strong>
      <span>正在連接 Broadway 電影資料...</span>
    </div>
  `;
}

function renderError(message) {
  setBroadwayGridState("error");
  elements.movieGrid.innerHTML = `
    <div class="empty-state">
      <strong>暫時無法取得電影資料</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderEmptyState() {
  setBroadwayGridState("empty");
  const message =
    state.tab === "now"
      ? {
          title: "暫時沒有上映場次",
          text: "目前沒有找到 Broadway 的上映電影。"
        }
      : {
          title: "暫時沒有即將上映電影",
          text: "Broadway 有新片資料時會顯示在這裡。"
        };

  elements.movieGrid.innerHTML = `
    <div class="empty-state">
      <strong>${message.title}</strong>
      <span>${message.text}</span>
    </div>
  `;
}

function renderMovieCard(movie) {
  const titleZh =
    movie.title?.zh ||
    movie.title?.en ||
    "未命名電影";

  const titleEn =
    movie.title?.en &&
    movie.title.en !== titleZh
      ? movie.title.en
      : "";

  const metadata = [];

  if (movie.rating) {
    metadata.push(movie.rating);
  }

  if (movie.durationMinutes) {
    metadata.push(`${movie.durationMinutes} 分鐘`);
  }

  if (state.tab === "coming" && movie.releaseDate) {
    metadata.push(movie.releaseDate);
  }

  const presaleIds = getPresaleIds();
  const movieSourceId = String(movie.sourceId || movie.id);
  const isPresale =
    state.tab === "coming" &&
    presaleIds.has(movieSourceId);

  const badge =
    state.tab === "coming"
      ? `
        <div class="movie-badges">
          <span class="movie-badge ${isPresale ? "presale" : "coming"}">
            ${isPresale ? "已預售" : "尚未開售"}
          </span>
        </div>
      `
      : "";

  const poster = movie.poster
    ? `
      <img
        src="${escapeHtml(movie.poster)}"
        alt="${escapeHtml(titleZh)}"
        loading="lazy"
        onerror="
          this.style.display='none';
          this.parentElement.classList.add('poster-error');
        "
      >
    `
    : "";

  return `
    <article
      class="movie-card"
      data-movie-id="${escapeHtml(movie.id)}"
      data-source-id="${escapeHtml(movieSourceId)}"
      data-home-languages="${metadataAttribute(movie.language)}"
      data-home-formats="${metadataAttribute(movie.formats)}"
      data-home-release-date="${escapeHtml(movie.releaseDate || "")}"
      role="button"
      tabindex="0"
      aria-label="比較 ${escapeHtml(titleZh)} 院線場次"
    >
      <div class="movie-poster">
        ${poster}
        ${badge}

        <button
          type="button"
          class="movie-favorite-button"
          data-movie-favorite
          aria-label="收藏${escapeHtml(titleZh)}"
          aria-pressed="false"
          title="收藏"
        ></button>

        <div class="poster-placeholder">
          HK Cinema
        </div>
      </div>

      <div class="movie-info">
        <h3>${escapeHtml(titleZh)}</h3>

        ${
          titleEn
            ? `<p class="movie-title-en">${escapeHtml(titleEn)}</p>`
            : ""
        }

        ${
          metadata.length
            ? `<p class="movie-meta">${escapeHtml(metadata.join(" · "))}</p>`
            : ""
        }
      </div>
    </article>
  `;
}

function render() {
  elements.sectionTitle.textContent =
    state.tab === "now"
      ? "現正上映"
      : "即將上映";

  if (state.loading) {
    elements.movieCount.textContent = "—";
    renderLoading();
    return;
  }

  const error = getCurrentError();

  if (error) {
    elements.movieCount.textContent = "—";
    renderError(error);
    return;
  }

  const visibleMovies = getVisibleMovies();

  elements.movieCount.textContent =
    `${visibleMovies.length} 部`;

  if (visibleMovies.length === 0) {
    renderEmptyState();
    return;
  }

  setBroadwayGridState("ready");
  elements.movieGrid.innerHTML =
    visibleMovies
      .map(renderMovieCard)
      .join("");
}

async function fetchMovieEndpoint(path) {
  const response = await fetch(
    `${API_BASE}${path}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`API HTTP ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok || !Array.isArray(result.data)) {
    throw new Error(
      result.error?.message ||
      "API response invalid"
    );
  }

  return result;
}

function updateStatusSummary() {
  const nowCount = getNowShowingMovies().length;
  const presaleCount = getPresaleMovies().length;
  const upcomingCount = getUpcomingMovies().length;

  const hasUsableData = state.showingMovies.length > 0 || state.upcomingMovies.length > 0 || state.cache.now || state.cache.coming;
  const usingCache = state.cache.now || state.cache.coming;
  const counts = `現正上映 ${nowCount} 部 · 預售 ${presaleCount} 部 · 即將上映 ${upcomingCount} 部`;

  if (state.errors.now && state.errors.coming && !hasUsableData) {
    setStatus(
      "error",
      "Broadway 資料暫時無法更新",
      "目前沒有可用的 Broadway 資料；MCL 及 Emperor 不受影響。"
    );
    reportBroadway("error", "network", "沒有可用資料");
    return;
  }

  if (state.errors.now || state.errors.coming) {
    setStatus(
      "loading",
      usingCache ? "Broadway 使用備用資料" : "Broadway 部分資料已連接",
      `${counts} · ${broadwayAgeText()}`
    );
    reportBroadway("degraded", usingCache ? "cache" : "network", `${counts} · 部分資料未能更新`);
    return;
  }

  setStatus(
    "ready",
    "Broadway 已連接",
    `${counts} · ${broadwayAgeText()}`
  );
  reportBroadway("fresh", "network", counts);
}

async function loadMovies() {
  const cacheEntries = readBroadwayCache();
  const hasCachedData = Boolean(cacheEntries.now || cacheEntries.coming);

  if (cacheEntries.now) {
    state.showingMovies = cacheEntries.now.data;
    state.updatedAt.now = cacheEntries.now.updatedAt || new Date(cacheEntries.now.savedAt).toISOString();
    state.cache.now = true;
  }
  if (cacheEntries.coming) {
    state.upcomingMovies = cacheEntries.coming.data;
    state.updatedAt.coming = cacheEntries.coming.updatedAt || new Date(cacheEntries.coming.savedAt).toISOString();
    state.cache.coming = true;
  }

  state.loading = !hasCachedData;
  state.errors.now = null;
  state.errors.coming = null;

  setStatus(
    "loading",
    "正在更新",
    hasCachedData
      ? `已先顯示備用資料 · ${broadwayAgeText()}，正在背景更新。`
      : "正在取得 Broadway 最新上映及即將上映資料。"
  );

  reportBroadway(
    "loading",
    hasCachedData ? "cache" : "network",
    hasCachedData ? "顯示備用資料並更新中" : "首次載入中"
  );

  render();

  const [showingResult, upcomingResult] =
    await Promise.allSettled([
      fetchMovieEndpoint("/api/broadway/movies"),
      fetchMovieEndpoint("/api/broadway/upcoming")
    ]);

  if (showingResult.status === "fulfilled") {
    state.showingMovies = showingResult.value.data;
    state.updatedAt.now =
      showingResult.value.meta?.updatedAt || null;
    state.cache.now = false;
    cacheEntries.now = {
      savedAt: Date.now(),
      updatedAt: state.updatedAt.now,
      data: state.showingMovies
    };
  } else {
    if (!cacheEntries.now) {
      state.showingMovies = [];
      state.updatedAt.now = null;
      state.cache.now = false;
    }
    state.errors.now =
      showingResult.reason instanceof Error
        ? showingResult.reason.message
        : String(showingResult.reason);
  }

  if (upcomingResult.status === "fulfilled") {
    state.upcomingMovies = upcomingResult.value.data;
    state.updatedAt.coming =
      upcomingResult.value.meta?.updatedAt || null;
    state.cache.coming = false;
    cacheEntries.coming = {
      savedAt: Date.now(),
      updatedAt: state.updatedAt.coming,
      data: state.upcomingMovies
    };
  } else {
    if (!cacheEntries.coming) {
      state.upcomingMovies = [];
      state.updatedAt.coming = null;
      state.cache.coming = false;
    }
    state.errors.coming =
      upcomingResult.reason instanceof Error
        ? upcomingResult.reason.message
        : String(upcomingResult.reason);
  }

  writeBroadwayCache(cacheEntries);
  state.loading = false;
  updateStatusSummary();
  render();
}

window.HKCinemaBroadwayApp = {
  getCatalogue() {
    return {
      now: [...state.showingMovies],
      coming: [...state.upcomingMovies]
    };
  }
};

function setTab(tab) {
  state.tab = tab;

  elements.tabs.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tab
    );
  });

  render();
  window.dispatchEvent(new CustomEvent("hkcinema:home-tab", {
    detail: { tab }
  }));
}

elements.tabs.forEach(button => {
  button.addEventListener("click", () => {
    setTab(button.dataset.tab);
  });
});

elements.refreshButton.addEventListener(
  "click",
  () => {
    loadMovies();
  }
);

loadMovies();
