(() => {
  const SITE_BASE = "https://www.mclcinema.com/";
  const API_BASE = `${SITE_BASE}MCLWebAPI2/`;
  const CACHE_MAX_AGE_MS = 2 * 60 * 1000;
  const REQUEST_TIMEOUTS = [8000, 12000];

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function cacheKey(movieSetId, date) {
    return `hkcinema:mcl-webapi-ticketing:${movieSetId}:${date || "default"}:v3`;
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
      // Ignore storage failures.
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

  function pad2(value) {
    return String(value).padStart(2, "0");
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

  function normalizeDate(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;

    const iso = text.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (iso) {
      return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
    }

    const chinese = text.match(/(?:星期[一二三四五六日天],?\s*)?(\d{1,2})月\s*(\d{1,2})日/);
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
    const text = String(value ?? "").trim().toUpperCase();
    if (!text) return null;

    const twelve = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/);
    if (twelve) {
      let hour = Number(twelve[1]) % 12;
      if (twelve[3] === "PM") hour += 12;
      return `${pad2(hour)}:${twelve[2]}`;
    }

    const twentyFour = text.match(/(?:^|T|\D)([01]?\d|2[0-3]):([0-5]\d)(?:\D|$)/);
    if (twentyFour) {
      return `${pad2(twentyFour[1])}:${twentyFour[2]}`;
    }

    return null;
  }

  function normalizeCinemaId(value) {
    const text = String(value ?? "").trim();
    if (!/^\d{1,4}$/.test(text)) return null;
    return text.length <= 3 ? text.padStart(3, "0") : text;
  }

  function parseHtml(text) {
    return new DOMParser().parseFromString(String(text || ""), "text/html");
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
      },
      house: {
        ...(existing.house || {}),
        ...(next.house || {})
      }
    };
  }

  function makeSession({ sessionId, cinemaId, date, time, cinemaName, versionName }) {
    const sid = String(sessionId ?? "").trim();
    if (!/^\d+$/.test(sid)) return null;

    const ci = normalizeCinemaId(cinemaId);

    return {
      id: `mcl:${sid}`,
      provider: "mcl",
      sourceId: sid,
      date: normalizeDate(date),
      time: normalizeTime(time),
      cinema: {
        id: ci,
        name: {
          zh: cinemaName ? String(cinemaName).replace(/\s+/g, " ").trim() : null,
          en: null
        }
      },
      house: { id: null, name: null },
      format: null,
      language: null,
      versionName: versionName ? String(versionName).trim() : null,
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
      bookingUrl: ci
        ? `${SITE_BASE}MCLSelectSeat.aspx?visLang=1&ci=${encodeURIComponent(ci)}&si=${encodeURIComponent(sid)}`
        : null
    };
  }

  function pickObjectValue(object, keys) {
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null && object[key] !== "") {
        return object[key];
      }
    }
    return null;
  }

  function collectStructured(value, sessions, dates, context = {}, depth = 0, seen = new Set()) {
    if (depth > 14 || value === null || value === undefined) return;

    if (typeof value === "string") {
      const date = normalizeDate(value);
      if (date) dates.add(date);

      if (/[<][a-z!/]/i.test(value) || /(?:si|sessionid)=\d+/i.test(value)) {
        collectHtml(value, sessions, dates, context);
      }
      return;
    }

    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach(item => collectStructured(item, sessions, dates, context, depth + 1, seen));
      return;
    }

    const lower = {};
    Object.entries(value).forEach(([key, item]) => {
      lower[String(key).toLowerCase()] = item;
    });

    const nextContext = {
      cinemaId:
        pickObjectValue(lower, ["cinemacodeid", "cinemacode", "cinemaid", "ci"]) ?? context.cinemaId,
      cinemaName:
        pickObjectValue(lower, ["cinemaname", "cinema", "cn", "name"]) ?? context.cinemaName,
      date:
        pickObjectValue(lower, ["businessday", "sessiondate", "showdate", "date", "day", "dn"]) ?? context.date,
      versionName:
        pickObjectValue(lower, ["displayversion", "versionname", "version", "vn"]) ?? context.versionName
    };

    const explicitSessionId = pickObjectValue(lower, [
      "sessionid",
      "filmsessionid",
      "filmsession",
      "session_id",
      "sid",
      "si"
    ]);

    const timeValue = pickObjectValue(lower, [
      "sessiondatetime",
      "showtime",
      "sessiontime",
      "starttime",
      "time",
      "st"
    ]);

    let sessionId = explicitSessionId;

    if (sessionId == null && timeValue != null) {
      const genericId = pickObjectValue(lower, ["id"]);
      if (/^\d+$/.test(String(genericId ?? ""))) {
        sessionId = genericId;
      }
    }

    if (sessionId != null) {
      const candidate = makeSession({
        sessionId,
        cinemaId: nextContext.cinemaId,
        date: pickObjectValue(lower, ["sessiondatetime", "businessday", "sessiondate", "showdate", "date", "day", "dn"]) ?? nextContext.date,
        time: timeValue,
        cinemaName: nextContext.cinemaName,
        versionName: nextContext.versionName
      });

      if (candidate && (candidate.time || candidate.cinema.id || candidate.date)) {
        sessions.set(candidate.sourceId, mergeSession(sessions.get(candidate.sourceId), candidate));
        if (candidate.date) dates.add(candidate.date);
      }
    }

    Object.values(value).forEach(item =>
      collectStructured(item, sessions, dates, nextContext, depth + 1, seen)
    );
  }

  function collectHtml(text, sessions, dates, context = {}) {
    const source = String(text || "");
    if (!source.trim()) return;

    const doc = parseHtml(source);

    doc.querySelectorAll("[data-day], [data-date], option").forEach(node => {
      [
        node.getAttribute("data-day"),
        node.getAttribute("data-date"),
        node.getAttribute("value"),
        node.textContent
      ].forEach(value => {
        const date = normalizeDate(value);
        if (date) dates.add(date);
      });
    });

    const selectors = [
      "a[href*='si=']",
      "a[href*='MCLSelectSeat']",
      ".session-bubble",
      "[data-id][data-time]",
      "[data-session-id]",
      "[data-sessionid]"
    ].join(",");

    doc.querySelectorAll(selectors).forEach(node => {
      let params = null;
      const href = node.getAttribute("href");

      if (href) {
        try {
          params = new URL(href, SITE_BASE).searchParams;
        } catch {
          params = null;
        }
      }

      const sessionId =
        node.getAttribute("data-id") ||
        node.getAttribute("data-session-id") ||
        node.getAttribute("data-sessionid") ||
        params?.get("si");

      const cinemaId =
        params?.get("ci") ||
        node.getAttribute("data-ci") ||
        node.getAttribute("data-cinema-code") ||
        context.cinemaId;

      const candidate = makeSession({
        sessionId,
        cinemaId,
        date:
          node.getAttribute("data-day") ||
          node.getAttribute("data-date") ||
          context.date,
        time:
          node.getAttribute("data-time") ||
          node.getAttribute("data-session-time") ||
          node.textContent,
        cinemaName: context.cinemaName,
        versionName: node.getAttribute("data-value") || context.versionName
      });

      if (candidate) {
        sessions.set(candidate.sourceId, mergeSession(sessions.get(candidate.sourceId), candidate));
        if (candidate.date) dates.add(candidate.date);
      }
    });

    const tagPattern = /<[^>]*(?:data-id|data-session-id|data-sessionid)=["'](\d+)["'][^>]*>/gi;
    let match;

    while ((match = tagPattern.exec(source)) !== null) {
      const tag = match[0];
      const sessionId = match[1];
      const timeMatch = tag.match(/data-(?:session-)?time=["']([^"']+)["']/i);
      const dayMatch = tag.match(/data-(?:show-)?(?:day|date)=["']([^"']+)["']/i);
      const ciMatch = tag.match(/(?:[?&]ci=|data-(?:ci|cinema-code)=["'])(\d+)/i);

      const candidate = makeSession({
        sessionId,
        cinemaId: ciMatch?.[1] || context.cinemaId,
        date: dayMatch?.[1] || context.date,
        time: timeMatch?.[1],
        cinemaName: context.cinemaName,
        versionName: context.versionName
      });

      if (candidate) {
        sessions.set(candidate.sourceId, mergeSession(sessions.get(candidate.sourceId), candidate));
        if (candidate.date) dates.add(candidate.date);
      }
    }
  }

  function parseMCLResponses(texts) {
    const sessions = new Map();
    const dates = new Set();

    for (const text of texts.filter(Boolean)) {
      const json = safeJson(text);

      if (json !== null) {
        collectStructured(json, sessions, dates);
      }

      collectHtml(text, sessions, dates);
    }

    return {
      sessions: Array.from(sessions.values()),
      availableDates: Array.from(dates).sort()
    };
  }

  function collectCinemaMap(value, map = new Map(), depth = 0) {
    if (depth > 10 || value == null) return map;

    if (Array.isArray(value)) {
      value.forEach(item => collectCinemaMap(item, map, depth + 1));
      return map;
    }

    if (typeof value !== "object") return map;

    const entries = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [String(key).toLowerCase(), item])
    );

    const id = pickObjectValue(entries, ["cinemacodeid", "cinemacode", "cinemaid", "ci", "id", "i", "code"]);
    const name = pickObjectValue(entries, ["cinemaname", "name", "cn", "n"]);

    if (id != null && typeof name === "string" && name.trim()) {
      const normalized = normalizeCinemaId(id);
      if (normalized) {
        map.set(normalized, name.trim());
        map.set(String(Number(normalized)), name.trim());
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
      const mapped = id
        ? cinemaMap.get(id) || cinemaMap.get(String(Number(id)))
        : null;

      return {
        ...session,
        cinema: {
          ...(session.cinema || {}),
          name: {
            ...(session.cinema?.name || {}),
            zh:
              mapped ||
              session.cinema?.name?.zh ||
              (id ? `MCL 戲院 ${id}` : "MCL 戲院")
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
    const languageParts = [
      info.l,
      info.s ? `字幕: ${info.s}` : null
    ].filter(Boolean);

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
      fetchText(`${API_BASE}GetShowDays.aspx?${query}`).catch(error => ({ error })),
      getCinemaMap()
    ]);

    const texts = [listResult, gridResult, daysResult]
      .filter(value => typeof value === "string");

    if (!texts.length) {
      const error = listResult?.error || gridResult?.error || daysResult?.error;
      throw error || new Error("MCL 場次連線失敗");
    }

    const parsed = parseMCLResponses(texts);
    let allSessions = applyCinemaNames(parsed.sessions, cinemaMap);
    let availableDates = parsed.availableDates;

    if (!allSessions.length) {
      const previews = [
        ["list", listResult],
        ["grid", gridResult],
        ["days", daysResult]
      ]
        .filter(([, value]) => typeof value === "string")
        .map(([name, value]) => `${name}=${String(value).replace(/\s+/g, " ").slice(0, 220)}`)
        .join(" | ");

      throw new Error(`MCL 場次格式未能識別：${previews}`);
    }

    let resolvedDate =
      selectedDate && availableDates.includes(selectedDate)
        ? selectedDate
        : availableDates[0] || allSessions.find(session => session.date)?.date || null;

    let selectedSessions = resolvedDate
      ? allSessions.filter(session => !session.date || session.date === resolvedDate)
      : allSessions;

    selectedSessions = await mapLimit(selectedSessions.slice(0, 40), 6, enrichSession);

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
    provider.ticketingTransport = "browser-direct-mclwebapi2-v3";
    provider.ticketingApiBase = API_BASE;
    return true;
  }

  if (!install()) {
    window.addEventListener("DOMContentLoaded", install, { once: true });
  }
})();
