const API_BASE = "https://gopgrayesa-api.icirena.ai/sync";
const APP_KEY = "500000";
const CHANNEL_CODE = "ECML_WEB_PROD_S_MPS";
const APP_VERSION = "H5_5.0";
const SIGNING_KEY = "3VIDRSDxD0Ck2b6e9K0RaB9Xo5s81tep";
const REQUEST_TIMEOUT_MS = 10000;
const METHOD = "gop.alipic.icirena.own.film.detail";

const encoder = new TextEncoder();
let importedSigningKey = null;

function canonicalize(values) {
  return Object.keys(values)
    .sort()
    .reduce((output, key) => {
      const value = values[key];
      if (value === null || value === undefined || value === "") return output;
      const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
      return `${output}${key}${rendered}`;
    }, "");
}

async function signingKey() {
  if (!importedSigningKey) {
    importedSigningKey = crypto.subtle.importKey(
      "raw",
      encoder.encode(SIGNING_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }
  return importedSigningKey;
}

async function sign(values) {
  const key = await signingKey();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonicalize(values))
  );
  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function encodeForm(values) {
  const form = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  return form.toString();
}

function emperorError(code, message, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function hkDateFromEpoch(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseClassification(movie) {
  if (Array.isArray(movie?.filmLevelList)) {
    return movie.filmLevelList.find(item => item?.localeCode === "hk")?.level || null;
  }
  try {
    const levels = JSON.parse(movie?.filmLevels || "[]");
    return levels.find(item => item?.localeCode === "hk")?.level || null;
  } catch {
    return null;
  }
}

function normalize(movie) {
  const sourceId = String(movie?.filmUniqueId || movie?.filmId || "").trim();
  return {
    id: `emperor:${sourceId}`,
    provider: "emperor",
    sourceId,
    title: {
      zh: movie?.filmName || movie?.filmEnName || "",
      en: movie?.filmEnName || null
    },
    poster: movie?.poster || null,
    releaseDate: hkDateFromEpoch(movie?.showDate),
    durationMinutes: Number.isFinite(Number(movie?.duration)) ? Number(movie.duration) : null,
    category: movie?.filmTypeName || null,
    rating: movie?.rating || null,
    classification: parseClassification(movie),
    language: movie?.filmLanguageName || null,
    subtitle: movie?.filmSubTitleName || null,
    directors: movie?.directors || null,
    cast: movie?.actors || null,
    description: movie?.introduction || null,
    trailer: movie?.filmTrailer || null,
    formats: String(movie?.filmVersion || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean),
    formatGroups: String(movie?.filmVersionGroup || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean),
    showStatus: movie?.showStatus || null,
    bookingUrl: sourceId
      ? `https://www.emperorcinemas.com/showtimes?wapid=${CHANNEL_CODE}&filmUniqueId=${encodeURIComponent(sourceId)}`
      : "https://www.emperorcinemas.com/showtimes"
  };
}

export async function getEmperorMovieDetail(filmUniqueId) {
  const sourceId = String(filmUniqueId || "").trim();
  if (!sourceId) {
    throw emperorError("EMPEROR_INVALID_FILM_ID", "Emperor film ID is required", 400);
  }

  const body = {
    empCode: "",
    leaseCode: "",
    channelCode: CHANNEL_CODE,
    larkSid: "",
    version: "H5",
    appVersion: APP_VERSION,
    filmUniqueId: sourceId,
    __cv__: "WEBSITE"
  };
  const timestamp = Date.now();
  const params = {
    method: METHOD,
    app_key: APP_KEY,
    sign_method: "sha256",
    timestamp,
    format: "json",
    simplify: true
  };
  const signature = await sign({ ...params, ...body });
  const url = new URL(API_BASE);
  Object.entries({ ...params, sign: signature }).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const hng = encodeURIComponent(
    `region=&lang=zh_TW&currency=&tz=&betaFlag=2&betaUID=&betaChannel=${CHANNEL_CODE}&betaCinema=`
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "*/*",
        "accept-language": "zh-HK,zh;q=0.9,en;q=0.7",
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://www.emperorcinemas.com",
        referer: "https://www.emperorcinemas.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",
        appKey: APP_KEY,
        channelCode: CHANNEL_CODE,
        "x-hng": hng,
        "EagleEye-UserData": hng
      },
      body: encodeForm(body)
    });

    if (response.status === 403) {
      throw emperorError("EMPEROR_BLOCKED", "Emperor upstream rejected the Worker request", 503);
    }
    if (response.status === 429) {
      throw emperorError("EMPEROR_RATE_LIMITED", "Emperor upstream rate limited the Worker request", 503);
    }
    if (!response.ok) {
      throw emperorError("EMPEROR_HTTP_ERROR", `Emperor upstream returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const result = payload?.result;
    if (!result || String(result.bizCode) !== "0" || !result.bizValue) {
      throw emperorError(
        "EMPEROR_API_ERROR",
        result?.bizMsg || result?.bizAlertMsg || "Emperor film detail request failed"
      );
    }

    return {
      movie: normalize(result.bizValue),
      source: "emperor-sync-film-detail"
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw emperorError("EMPEROR_TIMEOUT", "Emperor upstream request timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
