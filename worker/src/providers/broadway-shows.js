const TICKETING_URL =
  "https://www.cinema.com.hk/hk/movie/ticketing";

const MEDIA_BASE =
  "https://media.grabticks.com";

function parseLang(value) {
  if (!value) return {};

  if (typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function splitList(value) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makePosterUrl(filename) {
  if (!filename || typeof filename !== "string") {
    return null;
  }

  const dot = filename.lastIndexOf(".");

  if (dot === -1) {
    return `${MEDIA_BASE}/${filename}`;
  }

  return (
    `${MEDIA_BASE}/` +
    filename.slice(0, dot) +
    "__" +
    filename.slice(dot)
  );
}

function stripHtml(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (/^\$[0-9A-Za-z:_-]+$/.test(value.trim())) {
    return null;
  }

  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || null;
}

function extractNextPayload(html) {
  const pattern =
    /<script[^>]*>\s*self\.__next_f\.push\((\[[\s\S]*?\])\)\s*<\/script>/g;

  let output = "";
  let match;

  while ((match = pattern.exec(html)) !== null) {
    try {
      const chunk = JSON.parse(match[1]);

      if (
        Array.isArray(chunk) &&
        typeof chunk[1] === "string"
      ) {
        output += chunk[1];
      }
    } catch {
      // Ignore malformed/unrelated RSC chunks.
    }
  }

  return output;
}

function parseArrayAt(source, start) {
  if (source[start] !== "[") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") {
      depth++;
      continue;
    }

    if (char === "]") {
      depth--;

      if (depth === 0) {
        try {
          return JSON.parse(
            source.slice(start, i + 1)
          );
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function extractArray(source, key) {
  const marker = `"${key}":[`;
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  return parseArrayAt(
    source,
    markerIndex + marker.length - 1
  );
}

function getHongKongDate() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(new Date());
}

function toHongKongDateTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23"
    }
  ).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const day =
    `${values.year}-${values.month}-${values.day}`;

  const time =
    `${values.hour}:${values.minute}`;

  return {
    date: day,
    time,
    startAt:
      `${day}T${time}:${values.second}+08:00`
  };
}

function buildLocationMaps(siteGroups, showSites) {
  const sites = new Map();
  const houses = new Map();

  for (const site of showSites || []) {
    if (site?.id !== undefined) {
      sites.set(String(site.id), site);
    }
  }

  for (const group of siteGroups || []) {
    for (const item of group?.items || []) {
      const site = item?.site;

      if (!site || site.id === undefined) {
        continue;
      }

      sites.set(String(site.id), site);

      for (const house of site.houses || []) {
        if (house?.id !== undefined) {
          houses.set(String(house.id), house);
        }
      }
    }
  }

  return { sites, houses };
}

function normalizeMovie(movie) {
  const titleLang = parseLang(movie?.title_lang);
  const nameLang = parseLang(movie?.name_lang);
  const descriptionLang =
    parseLang(movie?.description_lang);
  const dialectLang = parseLang(movie?.dialect_lang);
  const subtitleLang = parseLang(movie?.subtitle_lang);
  const directorLang = parseLang(movie?.director_lang);
  const castLang = parseLang(movie?.cast_lang);

  return {
    id: `broadway:${movie.id}`,
    provider: "broadway",
    sourceId: String(movie.id),

    title: {
      zh:
        titleLang.zh_hk ||
        nameLang.zh_hk ||
        movie.title ||
        movie.name ||
        null,
      en:
        titleLang.en ||
        nameLang.en ||
        movie.title ||
        movie.name ||
        null
    },

    releaseDate:
      movie.openingDate
        ? String(movie.openingDate).slice(0, 10)
        : null,

    durationMinutes:
      Number.isFinite(movie.duration)
        ? movie.duration
        : Number(movie.duration) || null,

    rating: movie.category || null,

    language:
      dialectLang.zh_hk ||
      movie.dialect ||
      null,

    subtitles:
      splitList(
        subtitleLang.zh_hk ||
        movie.subtitle
      ),

    director:
      splitList(
        directorLang.zh_hk ||
        movie.director
      ),

    cast:
      splitList(
        castLang.zh_hk ||
        movie.cast
      ),

    description:
      stripHtml(
        descriptionLang.zh_hk ||
        movie.description
      ),

    poster:
      makePosterUrl(
        Array.isArray(movie.images)
          ? movie.images[0]
          : null
      ),

    trailer: movie.trailer || null
  };
}

function normalizeCinema(site) {
  const nameLang = parseLang(site?.name_lang);

  return {
    id: site?.id !== undefined
      ? `broadway:${site.id}`
      : null,
    provider: "broadway",
    sourceId:
      site?.id !== undefined
        ? String(site.id)
        : null,
    name: {
      zh:
        nameLang.zh_hk ||
        site?.shortName ||
        site?.name ||
        null,
      en:
        nameLang.en ||
        site?.name ||
        null
    }
  };
}

function normalizeHouse(house, fallbackId) {
  const nameLang = parseLang(house?.name_lang);

  const formatNames =
    (house?.nameConfig?.attrs || [])
      .map((item) => {
        const lang = parseLang(item?.name_lang);
        return lang.en || lang.zh_hk || null;
      })
      .filter(Boolean);

  return {
    id:
      house?.id !== undefined
        ? String(house.id)
        : fallbackId
          ? String(fallbackId)
          : null,
    name:
      nameLang.zh_hk ||
      house?.shortName ||
      house?.name ||
      null,
    format:
      formatNames.length
        ? formatNames.join(" / ")
        : null
  };
}

function normalizeSeatSummary(show) {
  const total = Number(show?.seats);
  const sold = Number(show?.sold);
  const held = Number(show?.seatsHold);

  if (
    !Number.isFinite(total) ||
    total < 0
  ) {
    return null;
  }

  const safeSold =
    Number.isFinite(sold) && sold >= 0
      ? sold
      : 0;

  const safeHeld =
    Number.isFinite(held) && held >= 0
      ? held
      : 0;

  const available = Math.max(
    total - safeSold - safeHeld,
    0
  );

  const unavailable =
    Math.max(total - available, 0);

  return {
    total,
    available,
    unavailable,
    held: safeHeld,
    sold: safeSold,
    blocked: 0,
    accessibleAvailable: 0,
    occupancy:
      total > 0
        ? Number((unavailable / total).toFixed(3))
        : null,
    source: "provider-summary",
    updatedAt: new Date().toISOString()
  };
}

function normalizePrice(show) {
  const amount = Number(show?.price);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return {
    currency: "HKD",
    adult: amount,
    display: amount,
    lowest: null,
    serviceFee: 0,
    ticketTypes: [],
    updatedAt: new Date().toISOString()
  };
}

function normalizeShow(show, movie, maps) {
  const dateTime =
    toHongKongDateTime(show?.time);

  if (!dateTime) {
    return null;
  }

  const siteId = show?.site?.id;
  const houseId = show?.house?.id;

  const site =
    maps.sites.get(String(siteId)) ||
    show?.site ||
    {};

  const house =
    maps.houses.get(String(houseId)) ||
    show?.house ||
    {};

  const normalizedHouse =
    normalizeHouse(house, houseId);

  const movieMeta = normalizeMovie(movie);

  return {
    id: `broadway:${show.id}`,
    provider: "broadway",
    sourceId: String(show.id),

    movieId: `broadway:${movie.id}`,
    cinemaId:
      siteId !== undefined
        ? `broadway:${siteId}`
        : null,

    cinema: normalizeCinema(site),

    house: {
      id: normalizedHouse.id,
      name: normalizedHouse.name
    },

    startAt: dateTime.startAt,
    date: dateTime.date,
    time: dateTime.time,

    format: normalizedHouse.format,
    language: movieMeta.language,
    subtitles: movieMeta.subtitles,

    bookingUrl:
      `https://www.cinema.com.hk/hk/show/${show.id}`,

    price: normalizePrice(show),
    seatSummary: normalizeSeatSummary(show)
  };
}

export async function getBroadwayMovieShows(
  movieId,
  requestedDate = null
) {
  const sourceId = String(movieId)
    .replace(/^broadway:/, "")
    .trim();

  const response = await fetch(TICKETING_URL, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language":
        "zh-HK,zh-TW;q=0.9,en;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (compatible; HKCinema/0.1)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `Broadway returned HTTP ${response.status}`
    );
  }

  const html = await response.text();
  const payload = extractNextPayload(html);

  if (!payload) {
    throw new Error(
      "Broadway Next.js payload not found"
    );
  }

  const movies = extractArray(payload, "movies");
  const shows = extractArray(payload, "shows");
  const siteGroups = extractArray(payload, "siteGroups") || [];
  const showSites = extractArray(payload, "showSites") || [];

  if (!Array.isArray(movies) || !Array.isArray(shows)) {
    throw new Error(
      "Broadway ticketing data not found"
    );
  }

  const movie = movies.find(
    (item) => String(item?.id) === sourceId
  );

  if (!movie) {
    return null;
  }

  const today = getHongKongDate();

  const movieShows = shows
    .filter((show) =>
      String(show?.movie?.id) === sourceId &&
      show?.published !== false &&
      show?.hold !== true
    )
    .map((show) => ({
      show,
      local: toHongKongDateTime(show?.time)
    }))
    .filter((item) =>
      item.local &&
      item.local.date >= today
    );

  const availableDates = Array.from(
    new Set(
      movieShows.map((item) => item.local.date)
    )
  ).sort();

  const selectedDate =
    requestedDate && availableDates.includes(requestedDate)
      ? requestedDate
      : availableDates[0] || requestedDate || today;

  const maps =
    buildLocationMaps(siteGroups, showSites);

  const sessions = movieShows
    .filter((item) =>
      item.local.date === selectedDate
    )
    .map((item) =>
      normalizeShow(item.show, movie, maps)
    )
    .filter(Boolean)
    .sort((a, b) =>
      a.startAt.localeCompare(b.startAt)
    );

  return {
    movie: normalizeMovie(movie),
    availableDates,
    selectedDate,
    sessions,
    source: {
      provider: "broadway",
      movieId: sourceId,
      totalFutureShows: movieShows.length,
      selectedDateShows: sessions.length
    }
  };
}
