(() => {
  const API_BASE = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const SHOW_LIST_CACHE_MS = 60 * 1000;
  const DETAIL_CACHE_MS = 20 * 1000;
  const REQUEST_TIMEOUT_MS = 12000;
  const MAX_CONCURRENT = 2;

  const showLists = new Map();
  const showListInFlight = new Map();
  const details = new Map();
  const queued = new Map();
  const inFlight = new Map();
  const queue = [];

  let generation = 0;
  let active = 0;
  let intersectionObserver = null;
  let mutationObserver = null;

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s·・|()（）\-–—]/g, "")
      .trim();
  }

  function isCineArtCard(card) {
    return card?.dataset?.provider === "cineart";
  }

  function selectedDate() {
    return window.HKCinemaProviderCompare?.getState?.()?.selectedDate || null;
  }

  function cardIdentity(card) {
    const movieId = String(card?.dataset?.movieSourceId || "").trim();
    const date = selectedDate();
    const time = card?.querySelector(".provider-compare-show-time")?.textContent?.trim() || "";
    const cinema = card?.querySelector(".provider-compare-show-main strong")?.textContent?.trim() || "";
    const secondary = card?.querySelector(".provider-compare-show-secondary")?.textContent?.trim() || "";
    if (!/^\d+$/.test(movieId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{1,2}:\d{2}$/.test(time)) {
      return null;
    }
    return { movieId, date, time, cinema, secondary, listKey: `${movieId}:${date}` };
  }

  function cachedEntry(map, key, maxAgeMs) {
    const entry = map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.savedAt > maxAgeMs) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }

  async function fetchJson(url, controller) {
    const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      let payload = null;
      try { payload = await response.json(); }
      catch { throw new Error(`CineArt enrichment HTTP ${response.status}`); }
      if (!response.ok || payload?.ok !== true || !payload?.data) {
        throw new Error(payload?.error?.message || `CineArt enrichment HTTP ${response.status}`);
      }
      return payload.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getShowList(identity, jobGeneration) {
    const cached = cachedEntry(showLists, identity.listKey, SHOW_LIST_CACHE_MS);
    if (cached) return cached;

    const existing = showListInFlight.get(identity.listKey);
    if (existing?.generation === jobGeneration) return existing.promise;

    const controller = new AbortController();
    const promise = fetchJson(
      `${API_BASE}/api/cineart/movies/${encodeURIComponent(identity.movieId)}/shows?date=${encodeURIComponent(identity.date)}`,
      controller
    ).then(result => {
      if (jobGeneration === generation) {
        showLists.set(identity.listKey, { savedAt: Date.now(), value: result });
      }
      return result;
    }).finally(() => {
      if (showListInFlight.get(identity.listKey)?.promise === promise) {
        showListInFlight.delete(identity.listKey);
      }
    });

    showListInFlight.set(identity.listKey, { controller, generation: jobGeneration, promise });
    return promise;
  }

  function sessionCinema(session) {
    return session?.cinema?.name?.zh || session?.cinema?.name?.en || session?.cinema?.name || "";
  }

  function resolveShowId(identity, result) {
    const sessions = Array.isArray(result?.sessions) ? result.sessions : [];
    let matches = sessions.filter(session =>
      String(session?.time || "") === identity.time &&
      normalize(sessionCinema(session)) === normalize(identity.cinema)
    );

    if (matches.length > 1 && identity.secondary) {
      const narrowed = matches.filter(session => {
        const house = normalize(session?.house?.name);
        return house && normalize(identity.secondary).includes(house);
      });
      if (narrowed.length) matches = narrowed;
    }

    const showId = String(matches[0]?.sourceId || matches[0]?.id || "").trim();
    return /^\d+$/.test(showId) ? showId : null;
  }

  async function getDetail(identity, showId, controller) {
    const key = `${showId}:${identity.movieId}`;
    const cached = cachedEntry(details, key, DETAIL_CACHE_MS);
    if (cached) return cached;

    const detail = await fetchJson(
      `${API_BASE}/api/cineart/shows/${encodeURIComponent(showId)}/detail?movieId=${encodeURIComponent(identity.movieId)}`,
      controller
    );
    details.set(key, { savedAt: Date.now(), value: detail });
    return detail;
  }

  function seatClass(available, total) {
    if (!Number.isFinite(available)) return "unknown";
    if (available <= 0) return "full";
    if (Number.isFinite(total) && total > 0) {
      const ratio = available / total;
      if (ratio <= 0.08) return "full";
      if (ratio <= 0.25) return "limited";
    }
    if (available <= 10) return "limited";
    return "available";
  }

  function updatePrice(card, price) {
    const display = Number(price?.adult ?? price?.display);
    if (!Number.isFinite(display)) return;
    const node = card.querySelector(".provider-compare-show-price");
    if (!node) return;
    node.textContent = `$${display}`;
    card.dataset.priceLoaded = "true";
    card.dataset.priceAdult = String(display);
    if (Number.isFinite(price?.student)) card.dataset.priceStudent = String(price.student);
    if (Number.isFinite(price?.child)) card.dataset.priceChild = String(price.child);
    if (Number.isFinite(price?.senior)) card.dataset.priceSenior = String(price.senior);

    window.dispatchEvent(new CustomEvent("hkcinema:compare-price", {
      detail: {
        provider: "cineart",
        adult: display,
        student: Number.isFinite(price?.student) ? price.student : null,
        child: Number.isFinite(price?.child) ? price.child : null,
        senior: Number.isFinite(price?.senior) ? price.senior : null
      }
    }));
  }

  function updateSeat(card, summary) {
    const available = Number(summary?.available);
    const total = Number(summary?.total);
    if (!Number.isFinite(available)) return;
    const node = card.querySelector(".provider-compare-seat");
    if (!node) return;
    node.classList.remove("unknown", "available", "limited", "full", "loading");
    node.classList.add(seatClass(available, total));
    node.textContent = Number.isFinite(total) ? `${available}/${total} 可選` : `${available} 個可選`;
    card.dataset.seatLoaded = "true";
    card.dataset.seatAvailable = String(available);
    if (Number.isFinite(total)) card.dataset.seatTotal = String(total);
    if (Number.isFinite(summary?.held)) card.dataset.seatHeld = String(summary.held);
    if (Number.isFinite(summary?.sold)) card.dataset.seatSold = String(summary.sold);
    if (Number.isFinite(summary?.blocked)) card.dataset.seatBlocked = String(summary.blocked);

    window.dispatchEvent(new CustomEvent("hkcinema:compare-seat-summary", {
      detail: {
        provider: "cineart",
        available,
        total: Number.isFinite(total) ? total : null,
        held: Number.isFinite(summary?.held) ? summary.held : null,
        sold: Number.isFinite(summary?.sold) ? summary.sold : null,
        blocked: Number.isFinite(summary?.blocked) ? summary.blocked : null
      }
    }));
  }

  function updateCard(card, detail) {
    if (!card?.isConnected) return;
    updatePrice(card, detail?.price);
    updateSeat(card, detail?.seatSummary);
    card.dataset.cineartEnriched = "true";
    delete card.dataset.cineartEnrichmentLoading;
    delete card.dataset.cineartEnrichmentError;
  }

  function currentCards(cards) {
    return Array.from(cards || []).filter(card =>
      card?.isConnected &&
      isCineArtCard(card) &&
      card.dataset.cineartEnriched !== "true"
    );
  }

  async function runJob(job) {
    const cards = currentCards(job.cards);
    if (!cards.length || job.generation !== generation) return;
    const sample = cards[0];
    const identity = cardIdentity(sample);
    if (!identity) return;

    cards.forEach(card => {
      card.dataset.cineartEnrichmentLoading = "true";
      delete card.dataset.cineartEnrichmentError;
    });

    const controller = new AbortController();
    const entry = { controller, generation: job.generation, cards: job.cards };
    inFlight.set(job.key, entry);

    try {
      const showList = await getShowList(identity, job.generation);
      if (job.generation !== generation) return;
      const showId = resolveShowId(identity, showList);
      if (!showId) throw new Error("CineArt show ID could not be resolved");
      const detail = await getDetail(identity, showId, controller);
      if (job.generation !== generation) return;
      for (const card of currentCards(job.cards)) updateCard(card, detail);
    } catch {
      const cancelled = job.generation !== generation || controller.signal.aborted;
      if (!cancelled) {
        for (const card of currentCards(job.cards)) {
          delete card.dataset.cineartEnrichmentLoading;
          card.dataset.cineartEnrichmentError = "true";
        }
      }
    } finally {
      if (inFlight.get(job.key) === entry) inFlight.delete(job.key);
      for (const card of job.cards) delete card.dataset.cineartEnrichmentLoading;
    }
  }

  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      if (!job) break;
      queued.delete(job.key);
      if (job.generation !== generation || !currentCards(job.cards).length) continue;
      active += 1;
      runJob(job).finally(() => {
        active = Math.max(0, active - 1);
        pump();
      });
    }
  }

  function enqueue(card) {
    if (!card?.isConnected || !isCineArtCard(card) || card.dataset.cineartEnriched === "true") return;
    const identity = cardIdentity(card);
    if (!identity) return;
    const key = `${identity.listKey}:${identity.time}:${normalize(identity.cinema)}:${normalize(identity.secondary)}`;

    const running = inFlight.get(key);
    if (running?.generation === generation) {
      running.cards.add(card);
      return;
    }
    const pending = queued.get(key);
    if (pending?.generation === generation) {
      pending.cards.add(card);
      return;
    }

    const job = { key, generation, cards: new Set([card]) };
    queued.set(key, job);
    queue.push(job);
    pump();
  }

  function cancelPendingWork() {
    generation += 1;
    queue.splice(0, queue.length);
    queued.clear();
    for (const entry of inFlight.values()) {
      try { entry.controller.abort("lifecycle"); }
      catch { entry.controller.abort(); }
    }
    inFlight.clear();
    for (const entry of showListInFlight.values()) {
      try { entry.controller.abort("lifecycle"); }
      catch { entry.controller.abort(); }
    }
    showListInFlight.clear();
    document.querySelectorAll("#providerCompareContent [data-cineart-enrichment-loading='true']")
      .forEach(card => delete card.dataset.cineartEnrichmentLoading);
  }

  function observeCards() {
    const content = document.querySelector("#providerCompareContent");
    const overlay = document.querySelector("#providerCompareOverlay");
    if (!content || !intersectionObserver || overlay?.hidden) return;
    content.querySelectorAll(".provider-compare-show[data-provider='cineart']").forEach(card => {
      if (card.dataset.cineartEnriched === "true" || card.dataset.cineartObserved === "true") return;
      card.dataset.cineartObserved = "true";
      intersectionObserver.observe(card);
    });
  }

  function install() {
    const overlay = document.querySelector("#providerCompareOverlay");
    const sheet = overlay?.querySelector(".provider-compare-sheet");
    const content = overlay?.querySelector("#providerCompareContent");
    if (!overlay || !sheet || !content) {
      requestAnimationFrame(install);
      return;
    }

    intersectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        intersectionObserver.unobserve(entry.target);
        enqueue(entry.target);
      }
    }, {
      root: sheet,
      rootMargin: "500px 0px",
      threshold: 0.01
    });

    mutationObserver = new MutationObserver(() => queueMicrotask(observeCards));
    mutationObserver.observe(content, { childList: true, subtree: true });

    window.addEventListener("hkcinema:provider-compare-lifecycle", event => {
      if (["open", "date-change", "close", "reload"].includes(event.detail?.type)) {
        cancelPendingWork();
      }
    });

    observeCards();
  }

  window.HKCinemaCineArtCompareEnrichment = Object.freeze({
    version: "m7d-1",
    refresh() { queueMicrotask(observeCards); },
    cancelPendingWork,
    getStats() {
      return {
        generation,
        active,
        queued: queue.length,
        inFlight: inFlight.size,
        showListCache: showLists.size,
        detailCache: details.size,
        maxConcurrent: MAX_CONCURRENT,
        detailCacheMs: DETAIL_CACHE_MS
      };
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
