(() => {
  const SITE_BASE = "https://www.mclcinema.com/";
  const API_BASE = `${SITE_BASE}MCLWebAPI2/`;
  const CACHE_MAX_AGE_MS = 2 * 60 * 1000;
  const REQUEST_TIMEOUTS = [8000, 12000];

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function cacheKey(movieSetId, date) {
    return `hkcinema:mcl-webapi-ticketing:${movieSetId}:${date || "default"}:v2`;
  }

  function readCache(movieSetId, date) {
    try {
      const key = cacheKey(movieSetId, date);
      const text = sessionStorage.getItem(key);
      if (!text) return null;

      const cached = JSON.parse(text);
      const age = Date.now() - Number(cached?.savedAt);
      if (
        !Number.isFinite(age) ||
        age < 0 ||
        age > CACHE_MAX_AGE_MS ||
        !cached?.data
      ) {
        sessionStorage.removeItem(key);
        return null;
      }

      return cached.data;
    } catch {
      return null;
    }
  }

  function writeCache(movieSetId, date, data) {
    try {
      sessionStorage.setItem(
        cacheKey(movieSetId, date),
        JSON.stringify({ savedAt: Date.now(), data })
      );
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  async function fetchTextOnce(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json, text/javascript, text/html, */*; q=0.01"
        }
      });

      if (!response.ok) {
        throw new Error(`MCL HTTP ${response.status}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchText(url, retry = true) {
    const timeouts = retry ? REQUEST_TIMEOUTS : [7000];
    let lastError = null;

    for (let attempt = 0; attempt < timeouts.length; attempt++) {
      try {
        return await fetchTextOnce(url, timeouts[attempt]);
      } catch (error) {
        lastError = error;
        if (attempt < timeouts.length - 1) {
          await sleep(650);
        }
      }
    }

    throw lastError || new Error("MCL request failed");
  }

  function safeJson(text) {
    try {
      return JSON.parse(String(text || "").trim());
    } catch {
      return null;
    }
  }

  function currentHongKongParts() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day)
    };
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function normalizeDate(value) {
    const text = String(value || "").trim();
    if (!text) return null;

    const iso = text.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
    }

    const chinese = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (chinese) {
      const now = currentHongKongParts();
      return `${now.year}-${pad2(chinese[1])}-${pad2(chinese[2])}`;
    }

    const slash = text.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})(?:\D|$)/);
    if (slash) {
      const now = currentHongKongParts();
      const day = Number(slash[1]);
      const month = Number(slash[2]);
      let year = now.year;

      if (now.month >= 11 && month <= 2) year += 1;
      if (now.month <= 2 && month >= 11) year -= 1;

      return `${year}-${pad2(month)}-${pad2(day)}`;
    }

    return null;
  }

  function normalizeTime(value) {
    const text = String(value || "").trim().toUpperCase();
    if (!text) return null;

    const twelve = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/);
    if (twelve) {
      let hour = Number(twelve[1]) % 12;
      if (twelve[3] === "PM") hour += 12;
      return `${pad2(hour)}:${twelve[2]}`;
    }

    const twentyFour = text.match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?:\D|$)/);
    if (twentyFour) {
      return `${pad2(twentyFour[1])}:${twentyFour[2]}`;
    }

    return null;
  }

  function parseHtml(text) {
    return new DOMParser().parseFromString(String(text || ""), "text/html");
  }

  function closestAttr(node, names) {
    let current = node;
    let depth = 0;

    while (current && current.nodeType === 1 && depth < 8) {
      for (const name of names) {
        const value = current.getAttribute?.(name);
        if (value) return value;
      }
      current = current.parentElement;
      depth++;
    }

    return null;
  }

  function closestCinemaName(node) {
    let current = node;
    let depth = 0;

    while (current && current.nodeType === 1 && depth < 7) {
      const direct =
        current.getAttribute?.("data-cinema-name") ||
        current.querySelector?.(".cinema-name, .cinema, [data-cinema-name], h2, h3, h4")?.textContent;

      const cleaned = String(direct || "").replace(/\s+/g, " ").trim();
      if (cleaned && cleaned.length <= 100 && !/^\d{1,2}:\d{2}/.test(cleaned)) {
        return cleaned;
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  }

  function hrefParams(node) {
    const href = node.getAttribute?.("href");
    if (!href) return null;

    try {
      return new URL(href, SITE_BASE).searchParams;
    } catch {
      return null;
    }
  }

  function mergeSession(existing, next) {
    if (!existing) return next;

    return {
      ...existing,
      ...Object.fromEntries(
        Object.entries(next).filter(([, value]) => value !== null && value !== "")
      ),
      cinema: {
        ...(existing.cinema || {}),
        ...(next.cinema || {}),
        name: {
          ...(existing.cinema?.name || {}),
          ...(next.cinema?.name || {})
        }
      }
    };
  }

  function parseSessionDocuments(texts) {
    const sessions = new Map();
    const dateSet = new Set();

    for (const text of texts.filter(Boolean)) {
      const doc = parseHtml(text);

      doc.querySelectorAll("[data-day], [data-date], [data-value], option").forEach(node => {
        for (const value of [
          node.getAttribute?.("data-day"),
          node.getAttribute?.("data-date"),
          node.getAttribute?.("data-value"),
          node.getAttribute?.("value"),
          node.textContent
        ]) {
          const date = normalizeDate(value);
          if (date) dateSet.add(date);
        }
      });

      const selector = [
        "a[href*='si=']",
        "a[href*='MCLSelectSeat']",
        ".session-bubble",
        "[data-id][data-time]",
        "[data-session-id]",
        "[data-sessionid]"
      ].join(",");

      doc.querySelectorAll(selector).forEach(node => {
        const params = hrefParams(node);
        const sessionId = String(
          node.getAttribute("data-id") ||
          node.getAttribute("data-session-id") ||
          node.getAttribute("data-sessionid") ||
          params?.get("si") ||
          ""
        ).trim();

        if (!/^\d+$/.test(sessionId)) return;

        const cinemaId = String(
          params?.get("ci") ||
          closestAttr(node, ["data-ci", "data-cinema-code", "data-cinemacode", "data-cinema-id"]) ||
          ""
        ).trim();

        const date = normalizeDate(
          node.getAttribute("data-day") ||
          node.getAttribute("data-date") ||
          closestAttr(node, ["data-day", "data-date", "data-show-day"])
        );

        const time = normalizeTime(
          node.getAttribute("data-time") ||
          node.getAttribute("data-session-time") ||
          node.textContent
        );

        if (date) dateSet.add(date);

        const candidate = {
          id: `mcl:${sessionId}`,
          provider: "mcl",
          sourceId: sessionId,
          date,
          time,
          cinema: {
            id: cinemaId || null,
            name: {
              zh: closestCinemaName(node) || null,
              en: null
            }
          },
          house: { id: null, name: null },
          format: null,
          language: null,
          versionName: node.getAttribute("data-value") || null,
          displayVersion: null,
          price: {
            display: null,
            adult: null,
            student: null,
            child: null,
            senior: null
          },
          seatSummary: {
            available: null,
            total: null,
            held: null,
            unavailable: null,
            occupiedPercent: null
          },
          bookingUrl: cinemaId
            ? `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(cinemaId)}&si=${encodeURIComponent(sessionId)}`
            : null
        };

        sessions.set(sessionId, mergeSession(sessions.get(sessionId), candidate));
      });

      const tagPattern = /<[^>]+(?:data-id|data-session-id)=["'](\d+)["'][^>]*>/gi;
      let match;
      while ((match = tagPattern.exec(text)) !== null) {
        const tag = match[0];
        const sessionId = match[1];
        const timeMatch = tag.match(/data-time=["']([^"']+)["']/i);
        const dayMatch = tag.match(/data-day=["']([^"']+)["']/i);
        const ciMatch = tag.match(/(?:[?&]ci=|data-ci=["'])(\d+)/i);
        const date = normalizeDate(dayMatch?.[1]);
        if (date) dateSet.add(date);

        const candidate = {
          id: `mcl:${sessionId}`,
          provider: "mcl",
          sourceId: sessionId,
          date,
          time: normalizeTime(timeMatch?.[1]),
          cinema: {
            id: ciMatch?.[1] || null,
            name: { zh: null, en: null }
          },
          house: { id: null, name: null },
          format: null,
          language: null,
          versionName: null,
          displayVersion: null,
          price: { display: null, adult: null, student: null, child: null, senior: null },
          seatSummary: { available: null, total: null, held: null, unavailable: null, occupiedPercent: null },
          bookingUrl: ciMatch?.[1]
            ? `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(ciMatch[1])}&si=${encodeURIComponent(sessionId)}`
            : null
        };

        sessions.set(sessionId, mergeSession(sessions.get(sessionId), candidate));
      }
    }

    return {
      sessions: Array.from(sessions.values()),
      availableDates: Array.from(dateSet).sort()
    };
  }

  function collectCinemaMap(value, map = new Map(), depth = 0) {
    if (depth > 8 || value == null) return map;

    if (Array.isArray(value)) {
      value.forEach(item => collectCinemaMap(item, map, depth + 1));
      return map;
    }

    if (typeof value !== "object") return map;

    const idKeys = ["id", "i", "ci", "CinemaCodeID", "CinemaCode", "code"];
    const nameKeys = ["n", "cn", "CinemaName", "name", "Name"];

    const id = idKeys.map(key => value[key]).find(item => item != null && item !== "");
    const name = nameKeys.map(key => value[key]).find(item => typeof item === "string" && item.trim());

    if (id != null && name) {
      const idText = String(id).trim();
      if (/^\d{1,4}$/.test(idText)) {
        map.set(idText.padStart(3, "0"), String(name).trim());
        map.set(idText, String(name).trim());
      }
    }

    Object.values(value).forEach(item => collectCinemaMap(item, map, depth + 1));
    return map;
  }

  async function getCinemaMap() {
    try {
      const text = await fetchText(`${API_BASE}GetCinemaDetails.aspx?l=1`, false);
      const json = safeJson(text);
      return json ? collectCinemaMap(json) : new Map();
    } catch {
      return new Map();
    }
  }

  function applyCinemaNames(sessions, cinemaMap) {
    return sessions.map(session => {
      const id = session.cinema?.id;
      const mapped = id ? cinemaMap.get(id) || cinemaMap.get(String(Number(id))) : null;
      const current = session.cinema?.name?.zh;

      return {
        ...session,
        cinema: {
          ...(session.cinema || {}),
          name: {
            ...(session.cinema?.name || {}),
            zh: mapped || current || (id ? `MCL 戲院 ${id}` : "MCL 戲院")
          }
        }
      };
    });
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

  async function enrichSession(session) {
    const cinemaId = session.cinema?.id;
    if (!cinemaId) return session;

    const sessionId = session.sourceId;
    const infoUrl = `${API_BASE}GetSessionInfo.aspx?l=1&si=${encodeURIComponent(sessionId)}&ci=${encodeURIComponent(cinemaId)}`;
    const priceUrl = `${API_BASE}GetPrice.aspx?l=1&si=${encodeURIComponent(sessionId)}&ci=${encodeURIComponent(cinemaId)}`;

    const [infoText, priceText] = await Promise.all([
      fetchText(infoUrl, false).catch(() => null),
      fetchText(priceUrl, false).catch(() => null)
    ]);

    const info = safeJson(infoText) || {};
    const prices = priceFromList(safeJson(priceText));
    const adult = prices.adult;
    const languageParts = [info.l, info.s ? `字幕: ${info.s}` : null].filter(Boolean);

    return {
      ...session,
      date: normalizeDate(info.dn) || session.date,
      time: normalizeTime(info.st) || session.time,
      house: {
        ...(session.house || {}),
        name: info.hn || session.house?.name || null
      },
      language: languageParts.join(" · ") || session.language || null,
      price: {
        display: adult,
        adult,
        student: prices.student,
        child: prices.child,
        senior: prices.senior
      },
      bookingUrl:
        `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(cinemaId)}&si=${encodeURIComponent(sessionId)}`
    };
  }

  async function mapLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        try {
          results[index] = await mapper(items[index], index);
        } catch {
          results[index] = items[index];
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, () => worker())
    );

    return results;
  }

  async function getTicketing(movieSetId, selectedDate = null) {
    const id = String(movieSetId || "").replace(/^mcl:/, "");
    if (!/^\d+$/.test(id)) {
      throw new Error("Invalid MCL movie ID");
    }

    const cached = readCache(id, selectedDate);
    if (cached) return cached;

    const query = `l=1&t=s&id=${encodeURIComponent(id)}`;
    const [listResult, gridResult, daysResult, cinemaMap] = await Promise.all([
      fetchText(`${API_BASE}GetNowShowingList.aspx?${query}`).catch(error => ({ error })),
      fetchText(`${API_BASE}GetNowShowingGrid.aspx?${query}&m=i`).catch(error => ({ error })),
      fetchText(`${API_BASE}GetShowDays.aspx?${query}`).catch(() => ""),
      getCinemaMap()
    ]);

    const texts = [listResult, gridResult, daysResult].filter(value => typeof value === "string");
    if (!texts.length) {
      const error = listResult?.error || gridResult?.error;
      throw error || new Error("MCL 場次連線失敗");
    }

    const parsed = parseSessionDocuments(texts);
    let allSessions = applyCinemaNames(parsed.sessions, cinemaMap);
    let availableDates = parsed.availableDates;

    if (!allSessions.length) {
      throw new Error(
        `MCL 場次格式未能識別（list=${typeof listResult === "string" ? listResult.length : 0}, grid=${typeof gridResult === "string" ? gridResult.length : 0}, days=${typeof daysResult === "string" ? daysResult.length : 0}）`
      );
    }

    let resolvedDate =
      selectedDate && availableDates.includes(selectedDate)
        ? selectedDate
        : availableDates[0] || allSessions.find(session => session.date)?.date || null;

    let selectedSessions = resolvedDate
      ? allSessions.filter(session => !session.date || session.date === resolvedDate)
      : allSessions;

    const enrichTarget = selectedSessions.slice(0, 40);
    selectedSessions = await mapLimit(enrichTarget, 6, enrichSession);

    const enrichedDates = new Set(availableDates);
    selectedSessions.forEach(session => {
      if (session.date) enrichedDates.add(session.date);
    });
    availableDates = Array.from(enrichedDates).sort();

    if (!resolvedDate) {
      resolvedDate = availableDates[0] || null;
    }

    if (resolvedDate) {
      selectedSessions = selectedSessions.filter(
        session => !session.date || session.date === resolvedDate
      );
    }

    selectedSessions.sort((a, b) =>
      String(a.time || "").localeCompare(String(b.time || ""))
    );

    const data = {
      movieSetId: id,
      availableDates,
      selectedDate: resolvedDate,
      sessions: selectedSessions,
      allSessions,
      availableVersions: [],
      source: {
        provider: "mcl",
        transport: "browser-direct",
        endpoint: "MCLWebAPI2",
        totalSessions: allSessions.length,
        selectedDateSessions: selectedSessions.length,
        updatedAt: new Date().toISOString()
      }
    };

    writeCache(id, selectedDate, data);
    return data;
  }

  function install() {
    const provider = window.HKCinemaProviders?.mcl;
    if (!provider) return false;

    provider.getTicketing = getTicketing;
    provider.ticketingTransport = "browser-direct-mclwebapi2";
    provider.ticketingApiBase = API_BASE;
    return true;
  }

  if (!install()) {
    window.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
