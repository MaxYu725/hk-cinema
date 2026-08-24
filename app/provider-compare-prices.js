(() => {
  const API_BASE = "https://www.mclcinema.com/MCLWebAPI2/";
  const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 7000;
  const MAX_CONCURRENT = 4;

  const cache = new Map();
  const queuedByKey = new Map();
  const inFlight = new Map();
  const queue = [];

  let active = 0;
  let generation = 0;
  let intersectionObserver = null;
  let mutationObserver = null;

  function normalizeCinemaCode(value) {
    const raw = String(value || "").trim();
    return /^\d{1,4}$/.test(raw) ? raw.padStart(3, "0") : raw;
  }

  function isMCLCard(card) {
    return Boolean(card?.querySelector(".provider-compare-source.mcl"));
  }

  function hasPrice(card) {
    const text = card?.querySelector(".provider-compare-show-price")?.textContent || "";
    return /\$\s*\d+(?:\.\d+)?/.test(text);
  }

  function getIdentifiers(card) {
    const href = card?.dataset?.bookingUrl || card?.getAttribute("href");
    if (!href) return null;

    try {
      const url = new URL(href, window.location.href);
      const cinemaCode = normalizeCinemaCode(
        url.searchParams.get("ci") || url.searchParams.get("cinemaCode")
      );
      const sessionId = String(
        url.searchParams.get("si") || url.searchParams.get("filmSessionId") || ""
      );
      if (!/^\d{1,4}$/.test(cinemaCode) || !/^\d+$/.test(sessionId)) return null;
      return { cinemaCode, sessionId, key: `${cinemaCode}:${sessionId}` };
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

  function safeJson(text) {
    try { return JSON.parse(String(text || "").trim()); }
    catch { return null; }
  }

  function priceFromList(value) {
    const items = Array.isArray(value) ? value : [];
    const find = words => {
      const item = items.find(entry => {
        const name = String(entry?.n || entry?.name || "").toLowerCase();
        return words.some(word => name.includes(word));
      });
      const number = Number(item?.p ?? item?.price);
      return Number.isFinite(number) ? number : null;
    };

    return {
      adult: find(["成人", "adult"]),
      student: find(["學生", "student"]),
      child: find(["小童", "child"]),
      senior: find(["長者", "senior"])
    };
  }

  async function fetchPrice(identifiers, controller) {
    const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${API_BASE}GetPrice.aspx?l=1&si=${encodeURIComponent(identifiers.sessionId)}&ci=${encodeURIComponent(identifiers.cinemaCode)}`,
        {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json, text/javascript, */*; q=0.01" }
        }
      );
      if (!response.ok) throw new Error(`MCL price HTTP ${response.status}`);
      const prices = priceFromList(safeJson(await response.text()));
      if (!Number.isFinite(prices.adult)) throw new Error("MCL adult price unavailable");
      return prices;
    } finally {
      clearTimeout(timer);
    }
  }

  function updateCard(card, prices, fromCache = false) {
    if (!card?.isConnected || !Number.isFinite(prices?.adult)) return;
    const node = card.querySelector(".provider-compare-show-price");
    if (!node) return;

    node.textContent = `$${prices.adult}`;
    card.dataset.priceLoaded = "true";
    card.dataset.priceAdult = String(prices.adult);
    if (Number.isFinite(prices.student)) card.dataset.priceStudent = String(prices.student);
    if (Number.isFinite(prices.child)) card.dataset.priceChild = String(prices.child);
    if (Number.isFinite(prices.senior)) card.dataset.priceSenior = String(prices.senior);
    card.dataset.priceCache = fromCache ? "true" : "false";
    delete card.dataset.priceLoading;
    delete card.dataset.priceError;

    window.dispatchEvent(new CustomEvent("hkcinema:compare-price", {
      detail: {
        comparisonSessionId: card.dataset.comparisonSessionId || null,
        provider: "mcl",
        adult: prices.adult,
        student: Number.isFinite(prices.student) ? prices.student : null,
        child: Number.isFinite(prices.child) ? prices.child : null,
        senior: Number.isFinite(prices.senior) ? prices.senior : null
      }
    }));
  }

  function setLoading(card) {
    if (!card?.isConnected || hasPrice(card)) return;
    const node = card.querySelector(".provider-compare-show-price");
    if (!node) return;
    node.textContent = "…";
    card.dataset.priceLoading = "true";
    delete card.dataset.priceError;
  }

  function clearLoading(card) {
    if (!card?.isConnected) return;
    delete card.dataset.priceLoading;
  }

  function setError(card) {
    if (!card?.isConnected || hasPrice(card)) return;
    const node = card.querySelector(".provider-compare-show-price");
    if (node) node.textContent = "—";
    delete card.dataset.priceLoading;
    card.dataset.priceError = "true";
  }

  function currentCards(cards) {
    return Array.from(cards || []).filter(card =>
      card?.isConnected &&
      !hasPrice(card) &&
      card.dataset.priceLoaded !== "true"
    );
  }

  async function runJob(job) {
    const { identifiers, generation: jobGeneration } = job;
    const cached = getCached(identifiers.key);
    if (cached) {
      for (const card of currentCards(job.cards)) updateCard(card, cached, true);
      return;
    }

    for (const card of currentCards(job.cards)) setLoading(card);

    const controller = new AbortController();
    const entry = { controller, cards: job.cards, generation: jobGeneration };
    inFlight.set(identifiers.key, entry);

    try {
      const data = await fetchPrice(identifiers, controller);
      if (jobGeneration !== generation) return;
      cache.set(identifiers.key, { savedAt: Date.now(), data });
      for (const card of currentCards(job.cards)) updateCard(card, data, false);
    } catch {
      const cancelled = jobGeneration !== generation || controller.signal.reason === "lifecycle";
      if (!cancelled) {
        for (const card of currentCards(job.cards)) setError(card);
      }
    } finally {
      for (const card of job.cards) clearLoading(card);
      if (inFlight.get(identifiers.key) === entry) inFlight.delete(identifiers.key);
    }
  }

  function pumpQueue() {
    while (active < MAX_CONCURRENT && queue.length) {
      const job = queue.shift();
      if (!job) break;
      queuedByKey.delete(job.identifiers.key);
      if (job.generation !== generation) continue;

      const cards = currentCards(job.cards);
      if (!cards.length) continue;
      job.cards = new Set(cards);
      active++;
      runJob(job).finally(() => {
        active = Math.max(0, active - 1);
        pumpQueue();
      });
    }
  }

  function enqueue(card) {
    if (
      !card?.isConnected ||
      !isMCLCard(card) ||
      hasPrice(card) ||
      card.dataset.priceLoaded === "true" ||
      card.dataset.priceLoading === "true" ||
      card.dataset.priceError === "true"
    ) return;

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

    const job = { identifiers, cards: new Set([card]), generation };
    queuedByKey.set(identifiers.key, job);
    queue.push(job);
    pumpQueue();
  }

  function cancelPendingWork() {
    generation++;
    queue.splice(0, queue.length);
    queuedByKey.clear();

    for (const entry of inFlight.values()) {
      try { entry.controller.abort("lifecycle"); }
      catch { entry.controller.abort(); }
    }

    for (const card of document.querySelectorAll(
      "#providerCompareContent .provider-compare-show[data-price-loading='true']"
    )) {
      const node = card.querySelector(".provider-compare-show-price");
      if (node && !hasPrice(card)) node.textContent = "—";
      clearLoading(card);
    }
  }

  function observeCards() {
    const content = document.querySelector("#providerCompareContent");
    const overlay = document.querySelector("#providerCompareOverlay");
    if (!content || !intersectionObserver || overlay?.hidden) return;

    content.querySelectorAll(".provider-compare-show").forEach(card => {
      if (!isMCLCard(card) || hasPrice(card)) return;
      if (card.dataset.priceObserved === "true") return;
      card.dataset.priceObserved = "true";
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
      rootMargin: "600px 0px",
      threshold: 0.01
    });

    mutationObserver = new MutationObserver(() => queueMicrotask(observeCards));
    mutationObserver.observe(content, { childList: true, subtree: true });

    window.addEventListener("hkcinema:provider-compare-lifecycle", event => {
      const type = event.detail?.type;
      if (["open", "date-change", "close", "reload"].includes(type)) {
        cancelPendingWork();
      }
    });

    observeCards();
  }

  window.HKCinemaProviderComparePrices = {
    version: "8d3",
    refresh() { queueMicrotask(observeCards); },
    cancelPendingWork,
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
