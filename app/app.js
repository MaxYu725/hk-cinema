const API_BASE =
  "https://hk-cinema-api.max-yu-jp.workers.dev";

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  return state.tab === "now"
    ? state.errors.now
    : state.errors.coming;
}

function getPresaleIds() {
  return new Set(
    getPresaleMovies().map(movie =>
      String(movie.sourceId || movie.id)
    )
  );
}

function renderLoading() {
  elements.movieGrid.innerHTML = `
    <div class="empty-state">
      <strong>正在載入電影</strong>
      <span>正在連接 Broadway 電影資料...</span>
    </div>
  `;
}

function renderError(message) {
  elements.movieGrid.innerHTML = `
    <div class="empty-state">
      <strong>暫時無法取得電影資料</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderEmptyState() {
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
    >
      <div class="movie-poster">
        ${poster}
        ${badge}

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

  if (state.errors.now && state.errors.coming) {
    setStatus(
      "error",
      "資料暫時無法更新",
      "Broadway 上映及即將上映資料目前均不可用。"
    );
    return;
  }

  if (state.errors.now || state.errors.coming) {
    setStatus(
      "loading",
      "Broadway 部分資料已連接",
      `現正上映 ${nowCount} 部 · 預售 ${presaleCount} 部 · 即將上映 ${upcomingCount} 部`
    );
    return;
  }

  setStatus(
    "ready",
    "Broadway 已連接",
    `現正上映 ${nowCount} 部 · 預售 ${presaleCount} 部 · 即將上映 ${upcomingCount} 部`
  );
}

async function loadMovies() {
  state.loading = true;
  state.errors.now = null;
  state.errors.coming = null;

  setStatus(
    "loading",
    "正在更新",
    "正在取得 Broadway 最新上映及即將上映資料。"
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
  } else {
    state.showingMovies = [];
    state.errors.now =
      showingResult.reason instanceof Error
        ? showingResult.reason.message
        : String(showingResult.reason);
  }

  if (upcomingResult.status === "fulfilled") {
    state.upcomingMovies = upcomingResult.value.data;
    state.updatedAt.coming =
      upcomingResult.value.meta?.updatedAt || null;
  } else {
    state.upcomingMovies = [];
    state.errors.coming =
      upcomingResult.reason instanceof Error
        ? upcomingResult.reason.message
        : String(upcomingResult.reason);
  }

  state.loading = false;
  updateStatusSummary();
  render();
}

function setTab(tab) {
  state.tab = tab;

  elements.tabs.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tab
    );
  });

  render();
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
