const TICKETING_URL =
  "https://www.cinema.com.hk/hk/movie/ticketing";

const UPCOMING_URL =
  "https://www.cinema.com.hk/hk/movie/upcoming";

const MEDIA_BASE =
  "https://media.grabticks.com";

function parseLang(value) {
  if (!value || typeof value !== "string") {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function splitNames(value) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makePosterUrl(filename) {
  if (!filename) {
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
      // Ignore unrelated or malformed Next.js chunks.
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
        const raw = source.slice(start, i + 1);

        try {
          return {
            value: JSON.parse(raw),
            end: i
          };
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

  const start =
    markerIndex + marker.length - 1;

  return parseArrayAt(source, start)?.value || null;
}

function movieArrayScore(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  const sample = items
    .filter((item) => item && typeof item === "object")
    .slice(0, 8);

  if (sample.length === 0) {
    return 0;
  }

  let score = 0;

  for (const item of sample) {
    if (item.openingDate) score += 4;
    if (item.id !== undefined) score += 1;

    if (
      item.title ||
      item.title_lang ||
      item.name ||
      item.name_lang
    ) {
      score += 3;
    }

    if (Array.isArray(item.images)) score += 2;
    if (item.duration !== undefined) score += 1;
    if (Array.isArray(item.movieTypes)) score += 1;
  }

  return score;
}

function extractMovieArray(source) {
  const preferredKeys = [
    "movies",
    "upcomingMovies",
    "upcomingMovie",
    "movieList",
    "movieLists",
    "films",
    "filmList",
    "programmes",
    "programs",
    "items"
  ];

  for (const key of preferredKeys) {
    const value = extractArray(source, key);

    if (movieArrayScore(value) >= 6) {
      return {
        key,
        value
      };
    }
  }

  const pattern = /"([^"\\]+)":\[/g;
  let match;
  let best = null;

  while ((match = pattern.exec(source)) !== null) {
    const key = match[1];
    const start = match.index + match[0].length - 1;

    const preview = source.slice(
      start,
      Math.min(source.length, start + 25000)
    );

    if (
      !preview.includes('"openingDate"') &&
      !preview.includes('"movieTypes"') &&
      !preview.includes('"title_lang"')
    ) {
      continue;
    }

    const parsed = parseArrayAt(source, start);

    if (!parsed || !Array.isArray(parsed.value)) {
      continue;
    }

    const score = movieArrayScore(parsed.value);

    if (!best || score > best.score) {
      best = {
        key,
        value: parsed.value,
        score
      };
    }

    if (score >= 40) {
      break;
    }
  }

  if (best && best.score >= 6) {
    return {
      key: best.key,
      value: best.value
    };
  }

  return null;
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

function addDays(dateString, days) {
  const [year, month, day] =
    dateString.split("-").map(Number);

  const date =
    new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function normalizeShowDate(value) {
  if (!value) {
    return null;
  }

  const match =
    String(value).match(/\d{4}-\d{2}-\d{2}/);

  return match ? match[0] : null;
}

function normalizeMovie(movie, activeMovieIds) {
  const titleLang = parseLang(movie.title_lang);
  const nameLang = parseLang(movie.name_lang);
  const dialectLang = parseLang(movie.dialect_lang);
  const subtitleLang = parseLang(movie.subtitle_lang);
  const directorLang = parseLang(movie.director_lang);
  const castLang = parseLang(movie.cast_lang);

  const today = getHongKongDate();

  const releaseDate =
    movie.openingDate
      ? String(movie.openingDate).slice(0, 10)
      : null;

  let status = "unknown";

  if (activeMovieIds.has(movie.id)) {
    status =
      releaseDate && releaseDate > today
        ? "presale"
        : "now-showing";
  }

  return {
    id: `broadway:${movie.id}`,
    provider: "broadway",
    sourceId: String(movie.id),
    movieKey: null,

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

    releaseDate,
    status,

    durationMinutes:
      Number.isFinite(movie.duration)
        ? movie.duration
        : Number(movie.duration) || null,

    category: movie.category || null,
    rating: movie.category || null,

    language:
      movie.dialect
        ? [dialectLang.zh_hk || movie.dialect]
        : [],

    subtitles:
      movie.subtitle
        ? [subtitleLang.zh_hk || movie.subtitle]
        : [],

    director:
      splitNames(
        directorLang.zh_hk || movie.director
      ),

    cast:
      splitNames(
        castLang.zh_hk || movie.cast
      ),

    poster:
      makePosterUrl(
        Array.isArray(movie.images)
          ? movie.images[0]
          : null
      ),

    trailer: movie.trailer || null,

    formats:
      Array.isArray(movie.movieTypes)
        ? movie.movieTypes
            .map((item) => item?.name)
            .filter(Boolean)
        : []
  };
}

async function fetchBroadwayPage(url, label) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; HKCinema/0.1)"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(
      `${label} returned HTTP ${response.status}`
    );
  }

  const html = await response.text();
  const payload = extractNextPayload(html);

  if (!payload) {
    throw new Error(
      `${label} Next.js payload not found`
    );
  }

  return payload;
}

export async function getBroadwayMovies() {
  const payload = await fetchBroadwayPage(
    TICKETING_URL,
    "Broadway"
  );

  const movies = extractArray(payload, "movies");
  const shows = extractArray(payload, "shows");

  if (!Array.isArray(movies)) {
    throw new Error(
      "Broadway movies array not found"
    );
  }

  if (!Array.isArray(shows)) {
    throw new Error(
      "Broadway shows array not found"
    );
  }

  const today = getHongKongDate();
  const windowEnd = addDays(today, 7);

  const currentShows = shows.filter((show) => {
    const showDate = normalizeShowDate(show?.date);

    return Boolean(
      showDate &&
      showDate >= today &&
      showDate <= windowEnd
    );
  });

  const activeMovieIds = new Set(
    currentShows
      .map((show) => show?.movie?.id)
      .filter(
        (id) => id !== null && id !== undefined
      )
  );

  const normalized = movies
    .filter(
      (movie) =>
        movie &&
        movie.active !== false &&
        activeMovieIds.has(movie.id)
    )
    .map((movie) =>
      normalizeMovie(movie, activeMovieIds)
    )
    .sort((a, b) =>
      (a.releaseDate || "9999-12-31")
        .localeCompare(b.releaseDate || "9999-12-31")
    );

  return {
    movies: normalized,
    source: {
      provider: "broadway",
      rawMovies: movies.length,
      rawShows: shows.length,
      currentWindowShows: currentShows.length,
      activeMovies: normalized.length,
      dateWindow: {
        from: today,
        to: windowEnd
      }
    }
  };
}

export async function getBroadwayUpcoming() {
  const payload = await fetchBroadwayPage(
    UPCOMING_URL,
    "Broadway upcoming"
  );

  const detected = extractMovieArray(payload);

  if (!detected || !Array.isArray(detected.value)) {
    throw new Error(
      "Broadway upcoming movie array not detected"
    );
  }

  const movies = detected.value;
  const today = getHongKongDate();

  const normalized = movies
    .filter((movie) => {
      if (!movie || movie.active === false) {
        return false;
      }

      if (!movie.openingDate) {
        return true;
      }

      return (
        String(movie.openingDate).slice(0, 10) >= today
      );
    })
    .map((movie) => ({
      ...normalizeMovie(movie, new Set()),
      status: "coming-soon"
    }))
    .sort((a, b) =>
      (a.releaseDate || "9999-12-31")
        .localeCompare(b.releaseDate || "9999-12-31")
    );

  return {
    movies: normalized,
    source: {
      provider: "broadway",
      page: "upcoming",
      detectedArrayKey: detected.key,
      rawMovies: movies.length,
      upcomingMovies: normalized.length,
      from: today
    }
  };
}
