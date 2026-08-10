(() => {
  let scheduled = false;
  let applying = false;
  let recommendationExpanded = false;
  let activeComparisonId = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function compareState() {
    return window.HKCinemaProviderCompare?.getState?.() || null;
  }

  function activeAggregate() {
    const matchId = compareState()?.match?.id;
    if (!matchId) return null;
    return window.HKCinemaMovieAggregates?.all?.().find(aggregate => (
      aggregate.id === matchId ||
      aggregate.primaryMatchId === matchId ||
      aggregate.variants?.some?.(variant => variant.matchId === matchId)
    )) || null;
  }

  function aggregateCard(aggregate) {
    if (!aggregate?.id) return null;
    try {
      return document.querySelector(`#movieGrid [data-phase8a-aggregate-id="${CSS.escape(aggregate.id)}"]`);
    } catch {
      return null;
    }
  }

  function movieFacts(aggregate) {
    const card = aggregateCard(aggregate);
    const metaText = card?.querySelector(".movie-meta")?.textContent?.trim() || "";
    const parts = metaText.split(" · ").map(value => value.trim()).filter(Boolean);
    const classification = parts.find(value => !/分鐘$/.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) || null;
    const duration = parts.find(value => /分鐘$/.test(value)) || null;
    const releaseDate = String(card?.dataset?.homeReleaseDate || "").slice(0, 10) ||
      parts.find(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) || null;

    return { classification, duration, releaseDate };
  }

  function visibleFactChips(facts) {
    return [facts.classification, facts.duration, facts.releaseDate].filter(Boolean);
  }

  function movieDetailsBody(facts) {
    const rows = [];
    if (facts.releaseDate) rows.push(["上映日期", facts.releaseDate]);
    if (facts.duration) rows.push(["片長", facts.duration]);
    if (facts.classification) rows.push(["級別", facts.classification]);
    if (!rows.length) return null;

    return {
      signature: JSON.stringify(rows),
      html: `
        <summary>
          <span>電影資料</span>
          <small>${rows.length} 項基本資料</small>
        </summary>
        <dl>
          ${rows.map(([label, value]) => `
            <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
          `).join("")}
        </dl>
      `
    };
  }

  function placeAfter(anchor, element) {
    if (!anchor || !element || anchor.nextElementSibling === element) return;
    anchor.insertAdjacentElement("afterend", element);
  }

  function decorateHero(root) {
    const hero = root.querySelector(".provider-compare-hero");
    if (!hero) return;

    const aggregate = activeAggregate();
    const facts = movieFacts(aggregate);
    const info = hero.querySelector(":scope > div:last-child");
    const eyebrow = info?.querySelector(":scope > .eyebrow");
    if (eyebrow && eyebrow.textContent !== "MOVIE") eyebrow.textContent = "MOVIE";

    const title = info?.querySelector("h1");
    const secondary = aggregate?.title?.secondary;
    let secondaryNode = info?.querySelector("[data-phase8b-secondary-title]");
    if (secondary && secondary !== title?.textContent?.trim()) {
      if (!secondaryNode) {
        secondaryNode = document.createElement("p");
        secondaryNode.dataset.phase8bSecondaryTitle = "true";
        secondaryNode.className = "phase8b-secondary-title";
        title?.insertAdjacentElement("afterend", secondaryNode);
      }
      if (secondaryNode.textContent !== secondary) secondaryNode.textContent = secondary;
    } else {
      secondaryNode?.remove();
    }

    const status = info?.querySelector(".provider-compare-status");
    if (status) {
      const chips = visibleFactChips(facts);
      const html = chips.length
        ? chips.map(value => `<span>${escapeHtml(value)}</span>`).join("")
        : "<span>電影場次比較</span>";
      status.classList.add("phase8b-movie-facts");
      if (status.innerHTML !== html) status.innerHTML = html;
    }

    const detailModel = movieDetailsBody(facts);
    let details = root.querySelector("[data-phase8b-movie-details]");
    if (!detailModel) {
      details?.remove();
      details = null;
    } else {
      if (!details) {
        details = document.createElement("details");
        details.className = "phase8b-movie-details";
        details.dataset.phase8bMovieDetails = "true";
        hero.insertAdjacentElement("afterend", details);
      }
      if (details.dataset.signature !== detailModel.signature) {
        const wasOpen = details.open;
        details.innerHTML = detailModel.html;
        details.dataset.signature = detailModel.signature;
        details.open = wasOpen;
      }
      placeAfter(hero, details);
    }

    const versionRail = root.querySelector("[data-phase8a-version-rail]");
    if (versionRail) placeAfter(details || hero, versionRail);
  }

  function recommendationSummary(panel) {
    const cards = Array.from(panel?.querySelectorAll(".provider-compare-recommendation-grid .provider-compare-recommendation") || []);
    const values = cards.slice(0, 2).map(card => {
      const label = card.querySelector("span")?.textContent?.trim();
      const value = card.querySelector("strong")?.textContent?.trim();
      return label && value && value !== "—"
        ? `${label.replace("全院線", "")} ${value}`
        : null;
    }).filter(Boolean);
    return values.join(" · ") || "按目前篩選計算";
  }

  function ensureRecommendationToggle(section, panel) {
    let toggle = section.querySelector("[data-phase8b-recommendation-toggle]");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "phase8b-section-toggle phase8b-recommendation-toggle";
      toggle.dataset.phase8bRecommendationToggle = "true";
      panel.insertAdjacentElement("beforebegin", toggle);
    }

    const expanded = String(recommendationExpanded);
    if (toggle.getAttribute("aria-expanded") !== expanded) toggle.setAttribute("aria-expanded", expanded);
    const html = `
      <span><strong>推薦場次</strong><small>${escapeHtml(recommendationSummary(panel))}</small></span>
      <em aria-hidden="true">⌄</em>
    `;
    if (toggle.innerHTML !== html) toggle.innerHTML = html;
    if (panel.hidden === recommendationExpanded) panel.hidden = !recommendationExpanded;
    panel.classList.add("phase8b-recommendation-panel");
    return toggle;
  }

  function restructureTimeline(root) {
    const timeline = root.querySelector(".provider-compare-timeline");
    const section = timeline?.closest(".provider-compare-timeline-section");
    if (!timeline || !section) return;

    const dateRail = section.querySelector(".provider-compare-date-rail");
    const heading = section.querySelector(".provider-compare-section-heading");
    const insights = section.querySelector("[data-provider-insights]");
    const recommendations = section.querySelector("[data-provider-recommendations]");
    const result = section.querySelector("[data-insight-result]");

    section.classList.add("phase8b-timeline-section");
    dateRail?.classList.add("phase8b-date-section");
    dateRail?.querySelector("[data-phase6m-filter-shortcut]")?.remove();

    if (insights) {
      insights.classList.add("phase8b-filter-section");
      const grid = insights.querySelector(".provider-compare-insight-grid");
      if (grid && !grid.hidden) grid.hidden = true;
    }

    if (recommendations) ensureRecommendationToggle(section, recommendations);

    if (heading) {
      heading.classList.add("phase8b-showtime-heading");
      const title = heading.querySelector("h2");
      if (title && title.textContent !== "全部場次") title.textContent = "全部場次";
    }

    if (dateRail && section.firstElementChild !== dateRail) section.prepend(dateRail);
    if (insights && dateRail) placeAfter(dateRail, insights);

    const recommendationToggle = section.querySelector("[data-phase8b-recommendation-toggle]");
    const beforeRecommendation = insights || dateRail;
    if (recommendationToggle && beforeRecommendation) placeAfter(beforeRecommendation, recommendationToggle);
    if (recommendations && recommendationToggle) placeAfter(recommendationToggle, recommendations);

    const beforeHeading = recommendations || recommendationToggle || insights || dateRail;
    if (heading && beforeHeading) placeAfter(beforeHeading, heading);
    if (result && heading) placeAfter(heading, result);
    if (result) placeAfter(result, timeline);
    else if (heading) placeAfter(heading, timeline);
  }

  function resetForComparison() {
    const id = compareState()?.match?.id || null;
    if (id === activeComparisonId) return;
    activeComparisonId = id;
    recommendationExpanded = false;
  }

  function apply() {
    scheduled = false;
    if (applying) return;
    const root = document.querySelector("#providerCompareContent");
    if (!root) return;

    applying = true;
    try {
      resetForComparison();
      decorateHero(root);
      restructureTimeline(root);
    } finally {
      applying = false;
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  function handleClick(event) {
    const toggle = event.target.closest?.("[data-phase8b-recommendation-toggle]");
    if (!toggle) return;
    event.preventDefault();
    event.stopPropagation();
    recommendationExpanded = !recommendationExpanded;
    schedule();
  }

  function install() {
    document.addEventListener("click", handleClick, true);
    window.addEventListener("hkcinema:provider-compare-open", schedule);
    window.addEventListener("hkcinema:provider-compare-lifecycle", schedule);
    window.addEventListener("hkcinema:compare-seat-summary", schedule);

    const observer = new MutationObserver(records => {
      if (applying) return;
      const relevant = records.some(record => {
        const target = record.target?.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target?.parentElement;
        if (!target?.closest?.("#providerCompareContent")) return false;
        if (target.closest?.("[data-phase8b-recommendation-toggle], [data-phase8b-movie-details]")) return false;
        return true;
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
  }

  window.HKCinemaPhase8BLayout = Object.freeze({
    refresh: schedule,
    getState() {
      return { recommendationExpanded, activeComparisonId };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();