const API_BASE = "https://gopgrayesa-api.icirena.ai/sync";
const APP_KEY = "500000";
const CHANNEL_CODE = "ECML_WEB_PROD_S_MPS";
const APP_VERSION = "H5_5.0";
const SIGNING_KEY = "3VIDRSDxD0Ck2b6e9K0RaB9Xo5s81tep";
const REQUEST_TIMEOUT_MS = 10000;

const METHODS = {
  showing: "gop.alipic.icirena.own.film.showing",
  coming: "gop.alipic.icirena.own.film.coming",
  detail: "gop.alipic.icirena.own.film.detail",
  queryCondition: "gop.alipic.icirena.own.schedule.queryConditionV2",
  schedules: "gop.alipic.icirena.own.filmschedule.list"
};

const encoder = new TextEncoder();
let importedSigningKey = null;

function canonicalize(values) {
  return Object.keys(values)
    .sort()
    .reduce((output, key) => {
      const value = values[key];
      if (value === null || value === undefined || value === "") {
        return output;
      }

      const rendered = typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

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
    form.set(
      key,
      typeof value === "object" ? JSON.stringify(value) : String(value)
    );
  });
  return form.toString();
}

function hngHeader(data) {
  const cinema = data.cinemaLinkId || data.cinemaId || "";
  return encodeURIComponent(
    `region=&lang=zh_TW&currency=&tz=&betaFlag=2&betaUID=&betaChannel=${CHANNEL_CODE}&betaCinema=${cinema}`
  );
}

function buildBody(data = {}, version = "H5") {
  return {
    empCode: "",
    leaseCode: "",
    channelCode: CHANNEL_CODE,
    larkSid: "",
    version,
    appVersion: APP_VERSION,
    ...data,
    __cv__: "WEBSITE"
  };
}

function emperorError(code, message, status = 502) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function emperorRequest(method, data = {}, options = {}) {
  const body = buildBody(data, options.version ?? "H5");
  const timestamp = Date.now();
  const params = {
    method,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  const hng = hngHeader(body);

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
      throw emperorError(
        "EMPEROR_BLOCKED",
        "Emperor upstream rejected the Worker request",
        503
      );
    }

    if (response.status === 429) {
      throw emperorError(
        "EMPEROR_RATE_LIMITED",
        "Emperor upstream rate limited the Worker request",
        503
      );
    }

    if (!response.ok) {
      throw emperorError(
        "EMPEROR_HTTP_ERROR",
        `Emperor upstream returned HTTP ${response.status}`
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw emperorError(
        "EMPEROR_INVALID_JSON",
        "Emperor upstream returned invalid JSON"
      );
    }

    const result = payload?.result;
    if (!result || String(result.bizCode) !== "0") {
      throw emperorError(
        "EMPEROR_API_ERROR",
        result?.bizMsg || result?.bizAlertMsg || "Emperor API request failed"
      );
    }

    return {
      value: result.bizValue,
      pageInfo: result.pageInfo || null,
      traceId: result.traceId || null
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw emperorError(
        "EMPEROR_TIMEOUT",
        "Emperor upstream request timed out",
        504
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function hkDateFromEpoch(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function hkTimeFromEpoch(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(11, 16);
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / 100 : null;
}

export function buildEmperorSessionBookingUrl({
  scheduleId,
  filmUniqueId,
  cinemaId,
  cinemaLinkId
} = {}) {
  const normalizedScheduleId = String(scheduleId || "").trim();
  const normalizedFilmId = String(filmUniqueId || "").trim();
  const normalizedCinemaLinkId = String(cinemaLinkId || cinemaId || "").trim();
  const normalizedCinemaId = String(cinemaId || cinemaLinkId || "").trim();

  if (!normalizedScheduleId || !normalizedFilmId || !normalizedCinemaLinkId || !normalizedCinemaId) {
    return null;
  }

  const url = new URL("https://www.emperorcinemas.com/seat");
  url.searchParams.set("cinemaId", normalizedCinemaId);
  url.searchParams.set("cinemaLinkId", normalizedCinemaLinkId);
  url.searchParams.set("filmUniqueId", normalizedFilmId);
  url.searchParams.set("scheduleId", normalizedScheduleId);
  url.searchParams.set("wapid", CHANNEL_CODE);
  return url.toString();
}

function normalizeMovie(movie) {
  const sourceId = String(movie?.filmUniqueId || "").trim();
  const levels = (() => {
    try {
      return JSON.parse(movie?.filmLevels || "[]");
    } catch {
      return [];
    }
  })();

  return {
    id: `emperor:${sourceId}`,
    provider: "emperor",
    sourceId,
    name: {
      zh: movie?.filmName || movie?.filmEnName || "",
      en: movie?.filmEnName || null
    },
    poster: movie?.poster || null,
    openingDate: hkDateFromEpoch(movie?.showDate),
    duration: Number.isFinite(Number(movie?.duration))
      ? Number(movie.duration)
      : null,
    category: movie?.filmTypeName || null,
    language: movie?.filmLanguageName || null,
    subtitle: movie?.filmSubTitleName || null,
    format: movie?.filmVersion || movie?.filmVersionGroup || null,
    rating: movie?.rating || null,
    classification: Array.isArray(levels)
      ? levels.find(item => item?.localeCode === "hk")?.level || null
      : null,
    directors: movie?.directors || null,
    cast: movie?.actors || null,
    description: movie?.introduction || null,
    trailer: movie?.filmTrailer || null,
    showStatus: movie?.showStatus || null,
    bookingUrl: sourceId
      ? `https://www.emperorcinemas.com/showtimes?wapid=${CHANNEL_CODE}&filmUniqueId=${encodeURIComponent(sourceId)}`
      : "https://www.emperorcinemas.com/showtimes"
  };
}

function normalizePurchase(schedule) {
  const seatRate = Number(schedule?.seatRate);
  const soldOut = Number.isFinite(seatRate) && seatRate >= 100;
  const blocked = schedule?.blockBookingFlag === "Y";
  const prioritySale = schedule?.prioritySaleFlag === "Y";
  const priorityAllowed = schedule?.canPurchaseFlag === "Y";
  const priorityRestricted = prioritySale && !priorityAllowed;

  return {
    canPurchase: !soldOut && !blocked && !priorityRestricted,
    scheduleKey: schedule?.scheduleKey || null,
    freeSeating: schedule?.freeSeatingFlag === "Y",
    soldOut,
    blocked,
    prioritySale,
    priorityAllowed,
    rawCanPurchaseFlag: schedule?.canPurchaseFlag || null,
    rawBlockBookingFlag: schedule?.blockBookingFlag || null,
    rawPrioritySaleFlag: schedule?.prioritySaleFlag || null
  };
}

function normalizeSchedule(group, schedule) {
  const totalSeats = Number(schedule?.hallSeatCount);
  const soldSeats = Number(schedule?.saleCount);
  const availableSeats = Number.isFinite(totalSeats) && Number.isFinite(soldSeats)
    ? Math.max(0, totalSeats - soldSeats)
    : null;
  const scheduleId = String(schedule?.scheduleId || "").trim();
  const filmUniqueId = String(schedule?.filmUniqueId || "").trim();
  const cinemaLinkId = String(
    schedule?.cinemaLinkId ||
    group?.cinemaInfo?.cinemaLinkId ||
    schedule?.cinemaId ||
    group?.cinemaInfo?.cinemaId ||
    ""
  ).trim();
  const cinemaId = String(
    schedule?.cinemaId ||
    group?.cinemaInfo?.cinemaId ||
    cinemaLinkId ||
    ""
  ).trim();

  return {
    id: `emperor:${scheduleId}`,
    provider: "emperor",
    sourceId: scheduleId,
    movieSourceId: filmUniqueId,
    cinema: {
      sourceId: cinemaLinkId,
      name: {
        zh: schedule?.cinemaLinkName || group?.cinemaInfo?.cinemaName || "Emperor Cinemas"
      },
      cityCode: group?.cinemaInfo?.cityCode || null,
      cityName: group?.cinemaInfo?.cityName || null
    },
    house: {
      sourceId: String(schedule?.hallId || ""),
      name: schedule?.hallName || null
    },
    date: hkDateFromEpoch(schedule?.showTime),
    time: hkTimeFromEpoch(schedule?.showTime),
    startsAt: Number.isFinite(Number(schedule?.showTime))
      ? new Date(Number(schedule.showTime)).toISOString()
      : null,
    endsAt: Number.isFinite(Number(schedule?.endTime))
      ? new Date(Number(schedule.endTime)).toISOString()
      : null,
    format: schedule?.filmVersion || schedule?.realDimensionalName || null,
    language: schedule?.filmLang || null,
    subtitle: schedule?.filmSubTitleName || null,
    price: {
      display: money(schedule?.standardPrice ?? schedule?.displayPrice),
      face: money(schedule?.standardOriginPrice ?? schedule?.displayOriginPrice),
      serviceFee: money(schedule?.ticketFee),
      lowest: money(schedule?.lowestPrice)
    },
    seatSummary: {
      total: Number.isFinite(totalSeats) ? totalSeats : null,
      sold: Number.isFinite(soldSeats) ? soldSeats : null,
      available: availableSeats,
      occupiedPercent: Number.isFinite(Number(schedule?.seatRate))
        ? Number(schedule.seatRate)
        : null
    },
    purchase: normalizePurchase(schedule),
    bookingUrl: buildEmperorSessionBookingUrl({
      scheduleId,
      filmUniqueId,
      cinemaId,
      cinemaLinkId
    })
  };
}

async function getScheduleDates(filmUniqueId) {
  const result = await emperorRequest(
    METHODS.queryCondition,
    { filmUniqueId }
  );

  const dates = new Set();
  for (const cinema of Array.isArray(result.value) ? result.value : []) {
    for (const version of Array.isArray(cinema?.filmVersions) ? cinema.filmVersions : []) {
      for (const value of Array.isArray(version?.showDates) ? version.showDates : []) {
        const date = hkDateFromEpoch(value);
        if (date) dates.add(date);
      }
    }
  }

  return Array.from(dates).sort();
}

export async function getEmperorMovies() {
  const result = await emperorRequest(
    METHODS.showing,
    { filmVersionCode: "" },
    { version: "" }
  );

  const movies = (Array.isArray(result.value) ? result.value : [])
    .map(normalizeMovie)
    .filter(movie => movie.sourceId);

  return {
    movies,
    source: "emperor-sync-film-showing"
  };
}

export async function getEmperorUpcoming() {
  const result = await emperorRequest(
    METHODS.coming,
    { filmVersionCode: "", filterPreSale: true },
    { version: "" }
  );

  const movies = (Array.isArray(result.value) ? result.value : [])
    .map(normalizeMovie)
    .filter(movie => movie.sourceId);

  return {
    movies,
    source: "emperor-sync-film-coming"
  };
}

export async function getEmperorMovieShows(filmUniqueId, requestedDate = null) {
  const sourceId = String(filmUniqueId || "").trim();
  if (!sourceId) {
    throw emperorError("EMPEROR_INVALID_FILM_ID", "Emperor film ID is required", 400);
  }

  const availableDates = await getScheduleDates(sourceId);
  const selectedDate = requestedDate || availableDates[0] || null;

  if (!selectedDate || !availableDates.includes(selectedDate)) {
    return {
      availableDates,
      selectedDate,
      sessions: [],
      source: "emperor-sync-filmschedule-list"
    };
  }

  const result = await emperorRequest(METHODS.schedules, {
    curPage: 1,
    itemsPerPage: 100,
    filmUniqueId: sourceId,
    needPromo: "Y",
    showDate: selectedDate
  });

  const sessions = [];
  for (const group of Array.isArray(result.value) ? result.value : []) {
    for (const schedule of Array.isArray(group?.schedules) ? group.schedules : []) {
      sessions.push(normalizeSchedule(group, schedule));
    }
  }

  sessions.sort((a, b) => String(a.startsAt || "").localeCompare(String(b.startsAt || "")));

  return {
    availableDates,
    selectedDate,
    sessions,
    source: "emperor-sync-filmschedule-list"
  };
}

export async function probeEmperor() {
  const result = await getEmperorMovies();
  return {
    ok: true,
    provider: "emperor",
    count: result.movies.length,
    source: result.source
  };
}
