(() => {
  const store = window.HKCinemaCatalogueStore || null;
  const domain = window.HKCinemaCatalogueDomain || null;
  const grid = document.querySelector("#movieGrid");
  const count = document.querySelector("#movieCount");
  const title = document.querySelector("#sectionTitle");
  const tabs = Array.from(document.querySelectorAll(".tab"));
  if (!store || !domain || !grid || !count || !title) return;

  let activeSection = document.querySelector(".tab.active")?.dataset?.tab === "coming"
    ? "coming"
    : "now";
  let queued = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function metadataAttribute(values) {
    return escapeHtml(JSON.stringify(Array.from(new Set((values || []).filter(Boolean)))));
  }

  function providerSources(aggregate) {
    return Object.fromEntries(Object.entries(aggregate?.home?.sourceIds || {})
      .filter(([, sourceId]) => Boolean(sourceId)));
  }

  function renderCard(aggregate, index) {
    const home = aggregate.home || {};
    const facts = aggregate.facts || {};
    const sources = providerSources(aggregate);
    const providers = Object.keys(sources);
    const displayTitle = aggregate.title?.display || "未命名電影";
    const secondaryTitle = aggregate.title?.secondary;
    const metadata = [];
    if (facts.classification) metadata.push(facts.classification);
    if (Number.isFinite(facts.durationMinutes)) metadata.push(`${facts.durationMinutes} 分鐘`);
    if (activeSection === "coming" && facts.releaseDate) metadata.push(facts.releaseDate);
    const badge = activeSection === "coming"
      ? `<div class="movie-badges"><span class="movie-badge ${home.presale ? "presale" : "coming"}">${home.presale ? "已預售" : "尚未開售"}</span></div>`
      : "";
    const poster = aggregate.posterUrl
      ? `<img src="${escapeHtml(aggregate.posterUrl)}" alt="${escapeHtml(displayTitle)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('poster-error');">`
      : "";
    const groupAttribute = aggregate.groupId
      ? `data-movie-group-id="${escapeHtml(aggregate.groupId)}"`
      : "";

    return `
      <article
        class="movie-card phase8a-movie-card"
        data-movie-aggregate-id="${escapeHtml(aggregate.id)}"
        data-phase8a-direct-compare="true"
        data-provider="${escapeHtml(home.primaryProvider || "")}"
        data-source-id="${escapeHtml(home.primarySourceId || "")}"
        data-movie-id="${escapeHtml(home.movieId || "")}"
        data-provider-sources="${escapeHtml(JSON.stringify(sources))}"
        data-providers="${escapeHtml(providers.join(","))}"
        data-booking-url="${escapeHtml(home.bookingUrl || "")}"
        data-home-languages="${metadataAttribute(home.languages)}"
        data-home-formats="${metadataAttribute(home.formats)}"
        data-home-release-date="${escapeHtml(home.releaseDate || "")}"
        data-home-default-order="${index + 1}"
        ${groupAttribute}
        role="button"
        tabindex="0"
        aria-label="比較 ${escapeHtml(displayTitle)} 院線場次"
      >
        <div class="movie-poster">
          ${poster}
          ${badge}
          <button
            type="button"
            class="movie-favorite-button"
            data-movie-favorite
            aria-label="收藏${escapeHtml(displayTitle)}"
            aria-pressed="false"
            title="收藏"
          ></button>
          <div class="poster-placeholder">HK Cinema</div>
        </div>
        <div class="movie-info">
          <h3>${escapeHtml(displayTitle)}</h3>
          ${secondaryTitle ? `<p class="movie-title-en">${escapeHtml(secondaryTitle)}</p>` : ""}
          ${metadata.length ? `<p class="movie-meta">${escapeHtml(metadata.join(" · "))}</p>` : ""}
        </div>
      </article>
    `;
  }

  function renderLoading() {
    grid.dataset.homeState = "loading";
    count.textContent = "—";
    grid.innerHTML = `
      <div class="empty-state">
        <strong>正在載入電影</strong>
        <span>正在連接各院線最新電影資料...</span>
      </div>
    `;
  }

  function renderEmpty(summary) {
    const coming = activeSection === "coming";
    const allFailed = summary.total > 0 && summary.failed === summary.total;
    const partiallyFailed = summary.failed > 0 && !allFailed;
    const heading = allFailed
      ? "暫時無法取得電影資料"
      : partiallyFailed
        ? "部分院線暫時無法更新"
        : coming
          ? "暫時沒有即將上映電影"
          : "暫時沒有上映場次";
    const detail = allFailed
      ? "各院線目前均未能更新，稍後可再試。"
      : partiallyFailed
        ? `部分院線資料暫時無法取得，其餘已連接院線目前沒有找到${coming ? "即將上映電影" : "上映電影"}，結果可能不完整。`
        : `已連接院線目前沒有找到${coming ? "即將上映電影" : "上映電影"}。`;
    grid.dataset.homeState = allFailed ? "error" : "empty";
    count.textContent = "0 部";
    grid.innerHTML = `
      <div class="empty-state" data-multi-provider-empty-state>
        <strong>${heading}</strong>
        <span>${detail}</span>
      </div>
    `;
  }

  function dispatchModel(model) {
    const matches = window.HKCinemaProviderMatches?.all?.() || [];
    const movieGroups = window.HKCinemaMovieGroups?.all?.() || [];
    window.dispatchEvent(new CustomEvent("hkcinema:provider-matches", {
      detail: {
        matches,
        count: matches.length,
        crossProviderCount: model.crossProviderCount,
        maxProviderCount: model.maxProviderCount,
        movieGroups,
        movieGroupCount: movieGroups.length,
        aggregates: model.aggregates,
        section: model.section
      }
    }));
  }

  function render() {
    queued = false;
    const model = domain.build(activeSection);
    title.textContent = activeSection === "coming" ? "即將上映" : "現正上映";

    if (model.aggregates.length) {
      grid.dataset.homeState = "ready";
      grid.innerHTML = model.aggregates.map(renderCard).join("");
      count.textContent = `${model.aggregates.length} 部`;
      count.title = `資料模型 ${model.aggregates.length} 部 · 跨院線配對 ${model.crossProviderCount} 部${
        model.maxProviderCount > 1 ? ` · 最高 ${model.maxProviderCount} 院線同片` : ""
      }`;
    } else if (model.summary.loading > 0) {
      renderLoading();
    } else {
      renderEmpty(model.summary);
    }

    dispatchModel(model);
    window.HKCinemaHomeLibrary?.apply?.();
  }

  function scheduleRender() {
    if (queued) return;
    queued = true;
    queueMicrotask(render);
  }

  function setSection(section) {
    activeSection = section === "coming" ? "coming" : "now";
    tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.tab === activeSection));
    render();
    window.dispatchEvent(new CustomEvent("hkcinema:home-tab", {
      detail: { tab: activeSection }
    }));
  }

  tabs.forEach(tab => tab.addEventListener("click", () => setSection(tab.dataset.tab)));
  window.addEventListener("hkcinema:catalogue-store", scheduleRender);

  window.HKCinemaMultiProvider = Object.freeze({
    version: "c3-1",
    refresh: scheduleRender,
    getProviderSources(card) {
      try {
        const parsed = JSON.parse(card?.dataset?.providerSources || "{}");
        return parsed && typeof parsed === "object" ? { ...parsed } : {};
      } catch {
        return {};
      }
    },
    getState() {
      return { section: activeSection, model: domain.getModel() };
    }
  });

  scheduleRender();
})();
