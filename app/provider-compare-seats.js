(() => {
  const API_BASE =
    "https://hk-cinema-api.max-yu-jp.workers.dev";
  const CACHE_MAX_AGE_MS = 90 * 1000;
  const MAX_CONCURRENT = 2;

  const cache = new Map();
  const queuedKeys = new Set();
  const queue = [];
  let active = 0;
  let intersectionObserver = null;
  let mutationObserver = null;

  function getIdentifiers(card) {
    const href = card?.getAttribute("href");
    if (!href) return null;

    try {
      const url = new URL(href, window.location.href);
      const cinemaCode =
        url.searchParams.get("ci") ||
        url.searchParams.get("cinemaCode");
      const sessionId =
        url.searchParams.get("si") ||
        url.searchParams.get("filmSessionId");

      if (
        !/^\d{1,4}$/.test(String(cinemaCode || "")) ||
        !/^\d+$/.test(String(sessionId || ""))
      ) {
        return null;
      }

      return {
        cinemaCode: String(cinemaCode),
        sessionId: String(sessionId),
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
    card.dataset.seatAvailable = String(available);
    if (Number.isFinite(total)) card.dataset.seatTotal = String(total);
    if (Number.isFinite(sold)) card.dataset.seatSold = String(sold);
    if (Number.isFinite(blocked)) card.dataset.seatBlocked = String(blocked);
    card.dataset.seatCache = fromCache ? "true" : "false";

    window.dispatchEvent(
      new CustomEvent("hkcinema:compare-seat-summary", {
        detail: {
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

  async function fetchSummary(identifiers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

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

  async function runJob(job) {
    const { card, identifiers } = job;
    const cached = getCached(identifiers.key);

    if (cached) {
      updateCard(card, cached, true);
      return;
    }

    setLoading(card);

    try {
      const data = await fetchSummary(identifiers);
      cache.set(identifiers.key, {
        savedAt: Date.now(),
        data
      });
      updateCard(card, data, false);
    } catch {
      setError(card);
    } finally {
      delete card.dataset.seatLoading;
    }
  }

  function pumpQueue() {
    while (active < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      if (!job) break;

      queuedKeys.delete(job.identifiers.key);

      if (
        !job.card?.isConnected ||
        job.card.dataset.seatLoaded === "true"
      ) {
        continue;
      }

      active++;
      runJob(job)
        .finally(() => {
          active--;
          pumpQueue();
        });
    }
  }

  function enqueue(card) {
    if (
      !card?.isConnected ||
      card.dataset.seatLoaded === "true" ||
      card.dataset.seatLoading === "true" ||
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

    if (queuedKeys.has(identifiers.key)) return;

    queuedKeys.add(identifiers.key);
    queue.push({ card, identifiers });
    pumpQueue();
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
      "MCL 座位會在場次接近畫面時自動更新；每次最多同時讀取 2 個 SeatPlan，避免一次請求全日所有場次。";

    timeline.insertAdjacentElement("beforebegin", note);
  }

  function observeCards() {
    const content = document.querySelector("#providerCompareContent");
    if (!content || !intersectionObserver) return;

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

    observeCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
