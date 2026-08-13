const BASE_URL = String(process.env.HK_CINEMA_CANDIDATE_WORKER_URL || "")
  .trim()
  .replace(/\/+$/, "");
const PROBE_MAX_ATTEMPTS = 12;
const DISCOVERY_MAX_ATTEMPTS = 4;
const RETRY_MS = 5000;

if (!BASE_URL) throw new Error("HK_CINEMA_CANDIDATE_WORKER_URL is required");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(endpoint, timeoutMs = 20000) {
  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); }
  catch { throw new Error(`non-JSON response (HTTP ${response.status})`); }
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }
  return payload;
}

async function retry(label, attempts, task) {
  let lastFailure = "no attempt completed";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) {
        console.log(`${label} attempt ${attempt}/${attempts} not ready: ${lastFailure}`);
        await sleep(RETRY_MS);
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastFailure}`);
}

async function validateProbe() {
  const endpoint = `${BASE_URL}/api/providers/probe/cineart`;
  return await retry("CineArt probe", PROBE_MAX_ATTEMPTS, async attempt => {
    const payload = await fetchJson(endpoint, 12000);
    const result = payload?.data;
    if (
      result?.provider !== "cineart" ||
      result?.healthy !== true ||
      result?.evidence?.source !== "cinearthouse-hk" ||
      result?.evidence?.evidence !== "site-shell-cinema-directory" ||
      Number(result?.evidence?.cinemaCount) < 3
    ) {
      throw new Error(`invalid CineArt probe: ${JSON.stringify(result)}`);
    }
    return {
      endpoint,
      attempt,
      latencyMs: result.latencyMs,
      cinemaCount: result.evidence.cinemaCount,
      cinemas: result.evidence.cinemas,
      bytesRead: result.evidence.bytesRead,
      stoppedEarly: result.evidence.stoppedEarly
    };
  });
}

async function validateDiscovery() {
  const endpoint = `${BASE_URL}/api/providers/cineart/discovery`;
  return await retry("CineArt discovery", DISCOVERY_MAX_ATTEMPTS, async attempt => {
    const payload = await fetchJson(endpoint, 30000);
    const result = payload?.data;
    const requiredCapabilities = [
      "catalogue",
      "cinemaList",
      "showtimes",
      "basePrice",
      "detailedPrices",
      "coarseSeatSummary",
      "strictSeatSummary",
      "languageMetadata",
      "subtitleMetadata"
    ];
    const missing = requiredCapabilities.filter(key => result?.capabilities?.[key] !== true);
    const seatMapCapabilityKnown = typeof result?.capabilities?.seatMapReadOnly === "boolean";
    const correlation = result?.correlation || {};
    const correlationFailed = [
      "showIdMatches",
      "movieIdMatches",
      "seatTotalMatches",
      "soldMatches",
      "notSoldMatches"
    ].filter(key => correlation[key] !== true);

    if (
      result?.provider !== "cineart" ||
      result?.mode !== "m7p1b-worker-adapter-discovery" ||
      Number(result?.home?.movieCount) < 1 ||
      Number(result?.home?.normalizedShowCount) < 1 ||
      Number(result?.home?.cinemaCount) < 3 ||
      result?.detail?.readOnly !== true ||
      result?.capabilities?.booking !== false ||
      !seatMapCapabilityKnown ||
      missing.length ||
      correlationFailed.length
    ) {
      throw new Error(JSON.stringify({
        reason: "invalid CineArt discovery",
        missingCapabilities: missing,
        seatMapCapabilityKnown,
        failedCorrelation: correlationFailed,
        result
      }));
    }

    return {
      endpoint,
      attempt,
      home: {
        movieCount: result.home.movieCount,
        showCount: result.home.showCount,
        normalizedShowCount: result.home.normalizedShowCount,
        cinemaCount: result.home.cinemaCount,
        dateRange: result.home.dateRange,
        sampleShow: result.home.sampleShow
      },
      detail: {
        transport: result.detail.transport,
        showSourceId: result.detail.showSourceId,
        movieSourceId: result.detail.movieSourceId,
        ticketTypeCount: result.detail.price?.ticketTypes?.length || 0,
        seatSummary: result.detail.seatSummary,
        seatPlan: result.detail.seatPlan
      },
      capabilities: result.capabilities,
      correlation: result.correlation
    };
  });
}

async function validateHealth() {
  const endpoint = `${BASE_URL}/health`;
  const payload = await fetchJson(endpoint, 12000);
  if (payload?.phase !== "6G") throw new Error(`health phase changed: ${payload?.phase}`);
  const service = String(payload?.providers?.cineart || "").trim();
  if (!service) {
    throw new Error(`CineArt Worker manifest missing: ${JSON.stringify(payload?.providers)}`);
  }
  return { endpoint, phase: payload.phase, cineartService: service, providers: payload.providers };
}

const result = {
  ok: true,
  baseUrl: BASE_URL,
  health: await validateHealth(),
  probe: await validateProbe(),
  discovery: await validateDiscovery()
};

console.log(JSON.stringify(result, null, 2));
