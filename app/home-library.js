(() => {
  const grid = document.querySelector("#movieGrid");
  const count = document.querySelector("#movieCount");
  const heading = document.querySelector(".section-heading");
  const core = window.HKCinemaHomeLibraryCore;
  const discoveryCore = window.HKCinemaHomeDiscoveryCore;
  if (!grid || !count || !heading || !core || !discoveryCore) return;

  const FAVORITES_KEY = "hkcinema:home-favorites:v1";
  const RECENT_KEY = "hkcinema:home-recent:v1";
  const SORT_KEY = "hkcinema:home-sort:v1";
  const MAX_RECENT = 30;

  const state = {
    query: "",
    view: "all",
    sort: loadSort()
  };
  let favorites = loadRecords(FAVORITES_KEY, "favoritedAt");
  let recent = loadRecords(RECENT_KEY, "lastViewedAt");
  let applyQueued = false;
  let toolsAnchor = null;
  let stickyQueued = false;

  function loadSort() {
    try {
      const stored = localStorage.getItem(SORT_KEY);
      return ["default", "release", "title"].includes(stored) ? stored : "default";
    } catch {
      return "default";
    }
  }

  function loadRecords(key, timestampField) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      if (!Array.isArray(value)) return new Map();
      return new Map(value
        .filter(record => record && typeof record.key === "string")
        .map(record => [record.key, {
          key: record.key,
          title: String(record.title || ""),
          [timestampField]: Number(record[timestampField]) || 0
        }]));
    } catch {
      return new Map();
    }
  }

  function saveRecords(key, records, timestampField, limit = Infinity) {
    try {
      const values = Array.from(records.values())
        .sort((left, right) => Number(right[timestampField]) - Number(left[timestampField]))
        .slice(0, limit);
      localStorage.setItem(key, JSON.stringify(values));
    } catch {
      // Storage can be unavailable in restricted/private contexts.
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activeTab() {
    return document.querySelector(".tab.active")?.dataset.tab || "now";
  }

  function ensureTools() {
    let tools = document.querySelector("#homeLibraryTools");
    if (tools) return tools;

    tools = document.createElement("section");
    tools.id = "homeLibraryTools";
    tools.className = "home-library-tools";
    tools.setAttribute("aria-label", "搜尋及整理電影");
    tools.innerHTML = `
      <div class="home-library-primary">
        <label class="home-movie-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            inputmode="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="搜尋電影"
            aria-label="搜尋電影"
            data-home-movie-search
          >
          <button type="button" data-home-search-clear hidden aria-label="清除搜尋">×</button>
        </label>
        <label class="home-movie-sort">
          <span>排序</span>
          <select data-home-movie-sort aria-label="電影排序">
            <option value="default">原有排序</option>
            <option value="release" data-home-release-sort>最新上映</option>
            <option value="title">片名</option>
          </select>
        </label>
      </div>
      <div class="home-library-filter-options" role="group" aria-label="電影清單">
        <button type="button" data-home-library-view="all" aria-pressed="true">
          全部 <span data-library-count="all">0</span>
        </button>
        <button type="button" data-home-library-view="favorites" aria-pressed="false">
          ♥ 收藏 <span data-library-count="favorites">0</span>
        </button>
        <button type="button" data-home-library-view="recent" aria-pressed="false">
          最近查看 <span data-library-count="recent">0</span>
        </button>
      </div>
      <div class="home-library-footer">
        <p class="home-library-result" data-home-library-result aria-live="polite"></p>
        <button type="button" data-home-recent-clear hidden>清除記錄</button>
      </div>
    `;
    heading.insertAdjacentElement("afterend", tools);
    tools.querySelector("[data-home-movie-sort]").value = state.sort;
    requestAnimationFrame(() => {
      toolsAnchor = tools.getBoundingClientRect().top + window.scrollY;
      syncStickyTools();
    });
    return tools;
  }

  function syncSortContext(tools) {
    const option = tools?.querySelector("[data-home-release-sort]");
    if (option) option.textContent = activeTab() === "coming" ? "最快上映" : "最新上映";
  }

  function syncStickyTools() {
    const tools = document.querySelector("#homeLibraryTools");
    if (!tools) return;
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    const stuck = mobile && Number.isFinite(toolsAnchor) && window.scrollY + 8 > toolsAnchor;
    tools.classList.toggle("is-stuck", stuck);
  }

  function scheduleStickySync() {
    if (stickyQueued) return;
    stickyQueued = true;
    requestAnimationFrame(() => {
      stickyQueued = false;
      syncStickyTools();
    });
  }

  function currentCards() {
    return Array.from(grid.querySelectorAll(".movie-card"));
  }

  function cardTitle(card) {
    return card.querySelector(".movie-info h3")?.textContent?.trim() || "未命名電影";
  }

  function cardKey(card) {
    if (card.dataset.libraryKey) return card.dataset.libraryKey;
    const groupId = String(card.dataset.movieGroupId || "").trim();
    const parsed = discoveryCore.parseVariantTitle(cardTitle(card));
    const key = groupId || `movie:${parsed.key || discoveryCore.normalizeTitle(cardTitle(card))}`;
    card.dataset.libraryKey = key;
    return key;
  }

  function cardSearchValues(card) {
    const values = [
      cardTitle(card),
      card.querySelector(".movie-title-en")?.textContent,
      card.querySelector(".movie-meta")?.textContent,
      card.dataset.homeLanguages,
      card.dataset.homeFormats
    ].map(value => value?.textContent || value).filter(Boolean);

    const group = card.dataset.movieGroupId
      ? window.HKCinemaMovieGroups?.get?.(card.dataset.movieGroupId)
      : null;
    if (group) {
      for (const variant of group.variants || []) {
        values.push(
          variant.title,
          ...(variant.tags || []),
          ...(variant.languages || []),
          ...(variant.formats || [])
        );
      }
    }
    return values;
  }

  function syncFavoriteButton(card, key) {
    const button = card.querySelector("[data-movie-favorite]");
    if (!button) return;
    const active = favorites.has(key);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", `${active ? "取消收藏" : "收藏"}${cardTitle(card)}`);
    button.title = active ? "取消收藏" : "收藏";
  }

  function viewMatches(key) {
    if (state.view === "favorites") return favorites.has(key);
    if (state.view === "recent") return recent.has(key);
    return true;
  }

  function effectiveSortMode() {
    if (state.sort === "release") {
      return activeTab() === "coming" ? "release-soonest" : "release-newest";
    }
    if (state.sort !== "default") return state.sort;
    if (state.view === "recent") return "recent";
    if (state.view === "favorites") return "favorites";
    return "default";
  }

  function renderEmpty(items, visible) {
    let empty = document.querySelector("#homeLibraryEmpty");
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "homeLibraryEmpty";
      empty.className = "empty-state home-library-empty";
      grid.insertAdjacentElement("afterend", empty);
    }

    if (visible.length || !items.length) {
      empty.hidden = true;
      return;
    }

    let title = "找不到相符電影";
    let detail = "可嘗試縮短關鍵字，或切換其他電影分類。";
    if (!state.query.trim() && state.view === "favorites") {
      title = "這個分類暫時沒有收藏";
      detail = "按電影海報右上角的愛心，即可保存在此裝置。";
    } else if (!state.query.trim() && state.view === "recent") {
      title = "最近還未查看電影";
      detail = "開啟電影後，會自動顯示在這裡。";
    }

    empty.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
    empty.hidden = false;
  }

  function apply() {
    const tools = ensureTools();
    syncSortContext(tools);
    const cards = currentCards();
    const items = cards.map((card, index) => {
      if (!card.dataset.homeDefaultOrder) card.dataset.homeDefaultOrder = String(index + 1);
      const key = cardKey(card);
      syncFavoriteButton(card, key);
      const searchValues = cardSearchValues(card);
      return {
        card,
        key,
        title: cardTitle(card),
        searchValues,
        releaseDate: String(card.dataset.homeReleaseDate || ""),
        defaultOrder: Number(card.dataset.homeDefaultOrder),
        favoritedAt: favorites.get(key)?.favoritedAt || 0,
        lastViewedAt: recent.get(key)?.lastViewedAt || 0
      };
    });
    const visible = items.filter(item => (
      core.searchMatches(item.searchValues, state.query) &&
      viewMatches(item.key)
    ));
    const visibleKeys = new Set(visible.map(item => item.key));

    for (const item of items) item.card.hidden = !visibleKeys.has(item.key);

    const sorted = [...items].sort((left, right) => core.compareItems(
      left,
      right,
      effectiveSortMode()
    ));
    sorted.forEach((item, index) => {
      item.card.style.order = String(index + 1);
    });

    const currentKeys = new Set(items.map(item => item.key));
    const favoriteCount = Array.from(favorites.keys()).filter(key => currentKeys.has(key)).length;
    const recentCount = Array.from(recent.keys()).filter(key => currentKeys.has(key)).length;
    tools.querySelector("[data-library-count='all']")?.replaceChildren(String(items.length));
    tools.querySelector("[data-library-count='favorites']")?.replaceChildren(String(favoriteCount));
    tools.querySelector("[data-library-count='recent']")?.replaceChildren(String(recentCount));
    tools.querySelectorAll("[data-home-library-view]").forEach(button => {
      const active = button.dataset.homeLibraryView === state.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const input = tools.querySelector("[data-home-movie-search]");
    if (input && input.value !== state.query) input.value = state.query;
    const clear = tools.querySelector("[data-home-search-clear]");
    if (clear) clear.hidden = !state.query.trim();
    const result = tools.querySelector("[data-home-library-result]");
    if (result) {
      const viewLabel = state.view === "favorites" ? "收藏" : state.view === "recent" ? "最近查看" : "全部電影";
      const queryLabel = state.query.trim();
      result.textContent = `${viewLabel}${queryLabel ? ` · 「${queryLabel}」` : ""} · 找到 ${visible.length} 部`;
    }
    const clearRecent = tools.querySelector("[data-home-recent-clear]");
    if (clearRecent) clearRecent.hidden = state.view !== "recent" || recentCount === 0;

    count.textContent = `${visible.length} 部`;
    renderEmpty(items, visible);
  }

  function scheduleApply() {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(() => {
      applyQueued = false;
      apply();
    });
  }

  function toggleFavorite(card) {
    const key = cardKey(card);
    if (favorites.has(key)) {
      favorites.delete(key);
    } else {
      favorites.set(key, {
        key,
        title: cardTitle(card),
        favoritedAt: Date.now()
      });
    }
    saveRecords(FAVORITES_KEY, favorites, "favoritedAt");
    apply();
  }

  function recordCard(card) {
    if (!card) return false;
    const key = cardKey(card);
    recent.delete(key);
    recent.set(key, {
      key,
      title: cardTitle(card),
      lastViewedAt: Date.now()
    });
    saveRecords(RECENT_KEY, recent, "lastViewedAt", MAX_RECENT);
    recent = loadRecords(RECENT_KEY, "lastViewedAt");
    scheduleApply();
    return true;
  }

  window.HKCinemaHomeLibrary = Object.freeze({
    version: "c3-1",
    apply,
    recordCard,
    getState() {
      return {
        query: state.query,
        view: state.view,
        sort: state.sort,
        favorites: Array.from(favorites.values()),
        recent: Array.from(recent.values())
      };
    }
  });

  document.addEventListener("input", event => {
    if (!event.target.matches?.("[data-home-movie-search]")) return;
    state.query = event.target.value;
    scheduleApply();
  });

  document.addEventListener("change", event => {
    if (!event.target.matches?.("[data-home-movie-sort]")) return;
    state.sort = event.target.value;
    try {
      localStorage.setItem(SORT_KEY, state.sort);
    } catch {
      // Storage can be unavailable in restricted/private contexts.
    }
    apply();
  });

  document.addEventListener("click", event => {
    const favoriteButton = event.target.closest?.("[data-movie-favorite]");
    if (favoriteButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleFavorite(favoriteButton.closest(".movie-card"));
      return;
    }

    const clearButton = event.target.closest?.("[data-home-search-clear]");
    if (clearButton) {
      event.preventDefault();
      state.query = "";
      const input = ensureTools().querySelector("[data-home-movie-search]");
      if (input) input.value = "";
      apply();
      input?.focus();
      return;
    }

    const viewButton = event.target.closest?.("[data-home-library-view]");
    if (viewButton) {
      event.preventDefault();
      state.view = viewButton.dataset.homeLibraryView;
      apply();
      return;
    }

    if (event.target.closest?.("[data-home-recent-clear]")) {
      event.preventDefault();
      recent.clear();
      saveRecords(RECENT_KEY, recent, "lastViewedAt", MAX_RECENT);
      apply();
      return;
    }

    const card = event.target.closest?.(".movie-card");
    if (card) recordCard(card);
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest?.("[data-movie-favorite]")) return;
    const card = event.target.closest?.(".movie-card");
    if (card) recordCard(card);
  }, true);

  window.addEventListener("hkcinema:provider-matches", scheduleApply);
  window.addEventListener("hkcinema:home-tab", () => {
    toolsAnchor = null;
    scheduleApply();
    requestAnimationFrame(() => {
      const tools = document.querySelector("#homeLibraryTools");
      if (tools) toolsAnchor = tools.getBoundingClientRect().top + window.scrollY;
      syncStickyTools();
    });
  });
  window.addEventListener("scroll", scheduleStickySync, { passive: true });
  window.addEventListener("resize", () => {
    toolsAnchor = null;
    scheduleStickySync();
  });

  ensureTools();
  scheduleApply();
})();
