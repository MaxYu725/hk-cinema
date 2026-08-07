const API_BASE =
  "https://hk-cinema-api.max-yu-jp.workers.dev";

const state = {
  tab: "now",
  movies: [],
  loading: true,
  error: null,
  updatedAt: null
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

function getVisibleMovies() {
  const movies =
    state.movies.filter(movie =>
      state.tab === "now"
        ? movie.status === "now-showing"
        : movie.status === "presale"
    );

  return movies.sort((a, b) => {
    const dateA =
      a.releaseDate || "0000-00-00";

    const dateB =
      b.releaseDate || "0000-00-00";

    // 現正上映：最新上映優先
    if (state.tab === "now") {
      return dateB.localeCompare(dateA);
    }

    // 預售：最近即將上映優先
    return dateA.localeCompare(dateB);
  });
}

function renderLoading() {
  elements.movieGrid.innerHTML = `
    <div class="empty-state">
      <strong>正在載入電影</strong>
      <span>正在連接 Broadway 電影資料...</span>
    </div>
  `;
}

function renderError() {
  elements.movieGrid.innerHTML = `
    <div class="empty-state">
      <strong>暫時無法取得電影資料</strong>
      <span>${escapeHtml(state.error)}</span>
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
          title: "暫時沒有預售電影",
          text: "有新預售場次時會顯示在這裡。"
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
    metadata.push(
      `${movie.durationMinutes} 分鐘`
    );
  }

  if (
    state.tab === "coming" &&
    movie.releaseDate
  ) {
    metadata.push(movie.releaseDate);
  }

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

  if (state.error) {
    elements.movieCount.textContent = "—";
    renderError();
    return;
  }

  const visibleMovies =
    getVisibleMovies();

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

async function loadMovies() {
  state.loading = true;
  state.error = null;

const nowCount =
  state.movies.filter(
    movie => movie.status === "now-showing"
  ).length;

const presaleCount =
  state.movies.filter(
    movie => movie.status === "presale"
  ).length;

setStatus(
  "ready",
  "Broadway 已連接",
  `現正上映 ${nowCount} 部 · 預售 ${presaleCount} 部`
);

  render();

  try {
    const response = await fetch(
      `${API_BASE}/api/broadway/movies`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `API HTTP ${response.status}`
      );
    }

    const result =
      await response.json();

    if (
      !result.ok ||
      !Array.isArray(result.data)
    ) {
      throw new Error(
        result.error?.message ||
        "API response invalid"
      );
    }

    state.movies = result.data;
    state.updatedAt =
      result.meta?.updatedAt || null;

    setStatus(
      "ready",
      "Broadway 已連接",
      `已取得 ${state.movies.length} 部有近期場次的電影。`
    );
  } catch (error) {
    state.error =
      error instanceof Error
        ? error.message
        : String(error);

    setStatus(
      "error",
      "資料暫時無法更新",
      "Broadway 資料來源目前不可用。"
    );
  } finally {
    state.loading = false;
    render();
  }
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
