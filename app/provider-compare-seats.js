(() => {
  const API_BASE =
    "https://hk-cinema-api.max-yu-jp.workers.dev";
  const CACHE_MAX_AGE_MS = 90 * 1000;
  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_CONCURRENT = 2;

  const cache = new Map();
  const queuedByKey = new Map();
  const inFlight = new Map();
  const queue = [];

  let active = 0;
  let generation = 0;
  let intersectionObserver = null;
  let mutationObserver = null;

  function normalizeCinemaCode(value) {
    const raw = String(value || "");
    return /^\d{1,4}$/.test(raw)
      ? raw.padStart(3, "0")
      : raw;
  }

  function getIdentifiers(card) {
    const href = card?.dataset?.bookingUrl || card?.getAttribute("href");
    if (!href) return null;

    try {
      const url = new URL(href, window.location.href);
      const cinemaCode = normalizeCinemaCode(
        url.searchParams.get("ci") ||
        url.searchParams.get("cinemaCode")
      );
      const sessionId = String(
        url.searchParams.get("si") ||
        url.searchParams.get("filmSessionId") ||
        ""
      );

      if (
        !/^\d{1,4}$/.test(cinemaCode) ||
        !/^\d+$/.test(sessionId)
      ) {
        return null;
      }

      return {
        cinemaCode,
        sessionId,
        key: `${cinemaCode}:${sessionId}`
      };
    } catch {
      return null;
    }
  }

  function getCached(key) {
    const cached = cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.savedAt > CACHE_MAX_AGE_MS) {
      cache.delete(key);
      return null;
    }

    return cached.data;
  }

  function seatClass(available, total) {
    if (!Number.isFinite(available)) return "unknown";
    if (available <= 0) return "full";
    if (available <= 10) return "limited";

    if (Number.isFinite(total) && total > 0) {
      const ratio = available / total;
      if (ratio <= 0.08) return "limited";
    }

    return "available";
  }

  function updateCard(card, summary, fromCache = false) {
    if (!card?.isConnected) return;

    const counts = summary?.counts || {};
    const available = Number(counts.available);
    const total = Number(counts.total);
    const sold = Number(counts.sold);
    const blocked = Number(counts.blocked);
    const seat = card.querySelector(".provider-compare-seat");

    if (!seat || !Number.isFinite(available)) return;

    seat.classList.remove(
      "unknown",
      "available",
      "limited",
      "full",
      "loading"
    );
    seat.classList.add(seatClass(available, total));
    seat.textContent = Number.isFinite(total)
      ? `${available}/${total} 可選`
      : `${available} 個可選`;

    card.dataset.seatLoaded = "true";
    delete card.dataset.seatLoading;
    delete card.dataset.seatError;
    card.dataset.seatAvailable = String(available);
    if (Number.isFinite(total)) card.dataset.seatTotal = String(total);
    if (Number.isFinite(sold)) card.dataset.seatSold = String(sold);
    if (Number.isFinite(blocked)) card.dataset.seatBlocked = String(blocked);
    card.dataset.seatCache = fromCache ? "true" : "false";

    window.dispatchEvent(
      new CustomEvent("hkcinema:compare-seat-summary", {
        detail: {
          comparisonSessionId: card.dataset.comparisonSessionId || null,
          provider: "mcl",
          available,
          total: Number.isFinite(total) ? total : null,
          sold: Number.isFinite(sold) ? sold : null,
          blocked: Number.isFinite(blocked) ? blocked : null
        }
      })
    );
  }

  function setLoading(card) {
    if (!card?.isConnected) return;
    const seat = card.querySelector(".provider-compare-seat");
    if (!seat) return;

    seat.classList.remove("unknown", "available", "limited", "full");
    seat.classList.add("loading");
    seat.textContent = "正在取得座位…";
    card.dataset.seatLoading = "true";
    delete card.dataset.seatError;
  }

  function clearLoading(card) {
    if (!card?.isConnected) return;
    delete card.dataset.seatLoading;
  }

  function setError(card) {
    if (!card?.isConnected) return;
    const seat = card.querySelector(".provider-compare-seat");
    if (!seat) return;

    seat.classList.remove("loading", "available", "limited", "full");
    seat.classList.add("unknown");
    seat.textContent = "座位暫不可用";
    delete card.dataset.seatLoading;
    card.dataset.seatError = "true";
  }

  async function fetchSummary(identifiers, controller) {
    const timer = setTimeout(() => {
      controller.abort("timeout");
    }, REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${API_BASE}/api/mcl/shows/${encodeURIComponent(identifiers.sessionId)}/seats?cinemaCode=${encodeURIComponent(identifiers.cinemaCode)}&summary=1`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        }
      );

      let result = null;
      try {
        result = await response.json();
      } catch {
        throw new Error(`MCL seat summary HTTP ${response.status}`);
      }

      if (!response.ok || !result?.ok || !result?.data?.counts) {
        throw new Error(
          result?.error?.message ||
          `MCL seat summary HTTP ${response.status}`
        );
      }

      return result.data;
    } finally {
      clearTimeout(timer);
    }
  }

  function currentCards(cards) {
    return Array.from(cards || []).filter(card =>
      card?.isConnected &&
      card.dataset.seatLoaded !== "true"
    );
  }

  async function runJob(job) {
    const { identifiers, generation: jobGeneration } = job;
    const cached = getCached(identifiers.key);

    if (cached) {
      for (const card of currentCards(job.cards)) {
        updateCard(card, cached, true);
      }
      return;
    }

    for (const card of currentCards(job.cards)) {
      setLoading(card);
    }

    const controller = new AbortController();
    const entry = {
      controller,
      cards: job.cards,
      generation: jobGeneration
    };
    inFlight.set(identifiers.key, entry);

    try {
      const data = await fetchSummary(identifiers, controller);

      if (jobGeneration !== generation) return;

      cache.set(identifiers.key, {
        savedAt: Date.now(),
        data
      });

      for (const card of currentCards(job.cards)) {
        updateCard(card, data, false);
      }
    } catch (error) {
      const lifecycleCancelled =
        jobGeneration !== generation ||
        controller.signal.reason === "lifecycle";

      if (!lifecycleCancelled) {
        for (const card of currentCards(job.cards)) {
          setError(card);
        }
      }
    } finally {
      for (const card of job.cards) {
        clearLoading(card);
      }

      if (inFlight.get(identifiers.key) === entry) {
        inFlight.delete(identifiers.key);
      }
    }
  }

  function pumpQueue() {
    while (active < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      if (!job) break;

      queuedByKey.delete(job.identifiers.key);

      if (job.generation !== generation) {
        continue;
      }

      const cards = currentCards(job.cards);
      if (!cards.length) {
        continue;
      }

      job.cards = new Set(cards);
      active++;
      runJob(job)
        .finally(() => {
          active = Math.max(0, active - 1);
          pumpQueue();
        });
    }
  }

  function enqueue(card) {
    if (
      !card?.isConnected ||
      card.dataset.seatLoaded === "true" ||
      card.dataset.seatError === "true"
    ) {
      return;
    }

    const identifiers = getIdentifiers(card);
    if (!identifiers) return;

    const cached = getCached(identifiers.key);
    if (cached) {
      updateCard(card, cached, true);
      return;
    }

    const running = inFlight.get(identifiers.key);
    if (running?.generation === generation) {
      running.cards.add(card);
      setLoading(card);
      return;
    }

    const queued = queuedByKey.get(identifiers.key);
    if (queued?.generation === generation) {
      queued.cards.add(card);
      return;
    }

    const job = {
      identifiers,
      cards: new Set([card]),
      generation
    };

    queuedByKey.set(identifiers.key, job);
    queue.push(job);
    pumpQueue();
  }

  function cancelPendingWork() {
    generation++;

    queue.splice(0, queue.length);
    queuedByKey.clear();

    for (const entry of inFlight.values()) {
      try {
        entry.controller.abort("lifecycle");
      } catch {
        entry.controller.abort();
      }
    }

    for (const card of document.querySelectorAll(
      "#providerCompareContent .provider-compare-show[data-seat-loading='true']"
    )) {
      clearLoading(card);
    }
  }

  function isMCLCard(card) {
    return Boolean(
      card?.querySelector(".provider-compare-source.mcl")
    );
  }

  function ensureLazyNote(content) {
    const section = content?.querySelector(
      ".provider-compare-timeline-section"
    );
    const timeline = section?.querySelector(
      ".provider-compare-timeline"
    );

    if (!section || !timeline) return;
    if (section.querySelector("[data-mcl-seat-lazy-note]")) return;
    if (!timeline.querySelector(".provider-compare-source.mcl")) return;

    const note = document.createElement("p");
    note.className = "provider-compare-seat-lazy-note";
    note.dataset.mclSeatLazyNote = "true";
    note.textContent =
      "MCL 座位會在場次接近畫面時自動更新；每次最多同時讀取 2 個 SeatPlan，切換日期或關閉比較時會自動取消舊請求。";

    timeline.insertAdjacentElement("beforebegin", note);
  }

  function observeCards() {
    const content = document.querySelector("#providerCompareContent");
    const overlay = document.querySelector("#providerCompareOverlay");
    if (!content || !intersectionObserver || overlay?.hidden) return;

    ensureLazyNote(content);

    content
      .querySelectorAll(".provider-compare-show")
      .forEach(card => {
        if (!isMCLCard(card)) return;
        if (card.dataset.seatObserved === "true") return;

        card.dataset.seatObserved = "true";
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

    intersectionObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          intersectionObserver.unobserve(entry.target);
          enqueue(entry.target);
        }
      },
      {
        root: sheet,
        rootMargin: "420px 0px",
        threshold: 0.01
      }
    );

    mutationObserver = new MutationObserver(() => {
      queueMicrotask(observeCards);
    });

    mutationObserver.observe(content, {
      childList: true,
      subtree: true
    });

    window.addEventListener(
      "hkcinema:provider-compare-lifecycle",
      event => {
        const type = event.detail?.type;
        if (
          type === "open" ||
          type === "date-change" ||
          type === "close" ||
          type === "reload"
        ) {
          cancelPendingWork();
        }
      }
    );

    observeCards();
  }

  window.HKCinemaProviderCompareSeats = {
    cancelPendingWork,
    refresh() {
      queueMicrotask(observeCards);
    },
    getStats() {
      return {
        generation,
        active,
        queued: queue.length,
        inFlight: inFlight.size,
        cacheEntries: cache.size,
        maxConcurrent: MAX_CONCURRENT,
        cacheMaxAgeMs: CACHE_MAX_AGE_MS
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
