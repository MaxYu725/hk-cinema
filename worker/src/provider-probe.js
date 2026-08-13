import { probeEmperor } from "./providers/emperor.js";
import { probeCineArt } from "./providers/cineart.js";
import { WORKER_PROVIDER_IDS } from "./provider-manifest.js";

const DEFAULT_TIMEOUT_MS = 4500;
const BROADWAY_PROBE_URL = "https://www.cinema.com.hk/hk/movie/ticketing";
const MCL_PROBE_URL = "https://www.mclcinema.com/MCLWebAPI2/GetCinemaDetails.aspx?l=1";

function probeError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  if (Number.isFinite(status)) error.status = status;
  return error;
}

function safeTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_TIMEOUT_MS;
  return Math.max(500, Math.min(DEFAULT_TIMEOUT_MS, Math.round(number)));
}

async function fetchTextWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("provider-probe-timeout"), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      throw probeError(
        "PROBE_HTTP_ERROR",
        `Provider probe returned HTTP ${response.status}`,
        response.status
      );
    }

    return { response, text };
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw probeError("PROBE_TIMEOUT", "Provider probe timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runWithDeadline(task, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(probeError("PROBE_TIMEOUT", "Provider probe timed out", 504)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeBroadway(fetchImpl, timeoutMs) {
  const { text } = await fetchTextWithTimeout(
    fetchImpl,
    BROADWAY_PROBE_URL,
    {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; HKCinemaProviderProbe/M7R1)"
      }
    },
    timeoutMs
  );

  const hasNextPayload = text.includes("self.__next_f.push");
  const hasMovieShape = /openingDate|movieTypes|title_lang/.test(text);

  if (!hasNextPayload || !hasMovieShape) {
    throw probeError(
      "PROBE_INVALID_PAYLOAD",
      "Broadway probe response did not contain the expected catalogue structure"
    );
  }

  return {
    evidence: "catalogue-page",
    source: "cinema.com.hk-ticketing",
    bytes: text.length
  };
}

function mclRecordCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
}

async function probeMCL(fetchImpl, timeoutMs) {
  const separator = MCL_PROBE_URL.includes("?") ? "&" : "?";
  const { text } = await fetchTextWithTimeout(
    fetchImpl,
    `${MCL_PROBE_URL}${separator}_=${Date.now()}`,
    {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "application/json,text/javascript,text/plain,*/*;q=0.8",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.7",
        Referer: "https://www.mclcinema.com/",
        "User-Agent": "Mozilla/5.0 (compatible; HKCinemaProviderProbe/M7R1)",
        "X-Requested-With": "XMLHttpRequest"
      }
    },
    timeoutMs
  );

  let payload;
  try {
    payload = JSON.parse(String(text || "").trim());
  } catch {
    throw probeError(
      "PROBE_INVALID_PAYLOAD",
      "MCL probe response was not valid JSON"
    );
  }

  const count = mclRecordCount(payload);
  if (count < 1) {
    throw probeError(
      "PROBE_EMPTY_PAYLOAD",
      "MCL probe response contained no cinema records"
    );
  }

  return {
    evidence: "cinema-directory",
    source: "mcl-webapi2",
    count
  };
}

function classifyProbeFailure(error) {
  const code = String(error?.code || "PROBE_UPSTREAM_ERROR");
  const status = Number.isFinite(error?.status) ? Number(error.status) : null;

  if (code.includes("TIMEOUT") || error?.name === "AbortError") {
    return { category: "timeout", code, status: status || 504 };
  }
  if (code.includes("BLOCKED") || status === 403) {
    return { category: "blocked", code, status };
  }
  if (code.includes("RATE_LIMITED") || status === 429) {
    return { category: "rate_limited", code, status };
  }
  if (code.includes("PAYLOAD_TOO_LARGE")) {
    return { category: "payload_too_large", code, status };
  }
  if (code.includes("INVALID_JSON") || code.includes("INVALID_PAYLOAD")) {
    return { category: "invalid_payload", code, status };
  }
  if (code.includes("EMPTY_PAYLOAD")) {
    return { category: "empty_payload", code, status };
  }
  if (code.includes("HTTP") || (status && status >= 400)) {
    return { category: "http_error", code, status };
  }
  if (error instanceof TypeError || /fetch|network|dns|socket/i.test(String(error?.message || ""))) {
    return { category: "network_error", code, status };
  }
  return { category: "upstream_error", code, status };
}

const DEFAULT_PROBE_BUILDERS = Object.freeze({
  broadway: ({ fetchImpl, timeoutMs }) => () => probeBroadway(fetchImpl, timeoutMs),
  mcl: ({ fetchImpl, timeoutMs }) => () => probeMCL(fetchImpl, timeoutMs),
  emperor: ({ emperorProbe, timeoutMs }) => async () => {
    const result = await runWithDeadline(() => emperorProbe(), timeoutMs);
    if (!result?.ok || !Number.isFinite(Number(result?.count))) {
      throw probeError(
        "PROBE_INVALID_PAYLOAD",
        "Emperor probe response did not contain a valid catalogue result"
      );
    }
    return {
      evidence: "showing-catalogue",
      source: result.source || "emperor-sync-film-showing",
      count: Number(result.count)
    };
  },
  cineart: ({ fetchImpl, timeoutMs }) => () => probeCineArt({
    fetchImpl,
    timeoutMs
  })
});

export const SUPPORTED_PROVIDERS = WORKER_PROVIDER_IDS;

function defaultHandlers(dependencies) {
  return new Map(WORKER_PROVIDER_IDS.map(provider => {
    const build = DEFAULT_PROBE_BUILDERS[provider];
    if (typeof build !== "function") {
      throw new Error(`Missing provider probe adapter: ${provider}`);
    }
    return [provider, build(dependencies)];
  }));
}

export function createProviderProbeRunner({
  fetchImpl = globalThis.fetch,
  emperorProbe = probeEmperor,
  clock = () => Date.now(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  additionalProbes = {}
} = {}) {
  const lastSuccess = new Map();
  const boundedTimeout = safeTimeout(timeoutMs);
  const dependencies = { fetchImpl, emperorProbe, timeoutMs: boundedTimeout };
  const handlers = defaultHandlers(dependencies);

  for (const [provider, handler] of Object.entries(additionalProbes || {})) {
    const key = String(provider || "").trim().toLowerCase();
    if (!key || typeof handler !== "function") continue;
    handlers.set(key, () => runWithDeadline(() => handler(dependencies), boundedTimeout));
  }

  const supportedProviders = Object.freeze(Array.from(handlers.keys()));

  async function execute(provider) {
    const handler = handlers.get(provider);
    if (!handler) throw probeError("INVALID_PROVIDER", `Unsupported provider: ${provider}`, 400);
    return await handler();
  }

  async function probeProvider(provider) {
    const key = String(provider || "").toLowerCase();
    if (!handlers.has(key)) {
      throw probeError("INVALID_PROVIDER", `Unsupported provider: ${provider}`, 400);
    }

    const startedAt = clock();
    try {
      const evidence = await execute(key);
      const finishedAt = clock();
      const checkedAt = new Date(finishedAt).toISOString();
      lastSuccess.set(key, checkedAt);

      return {
        provider: key,
        healthy: true,
        status: "healthy",
        latencyMs: Math.max(0, Math.round(finishedAt - startedAt)),
        checkedAt,
        lastSuccessAt: checkedAt,
        failure: null,
        evidence
      };
    } catch (error) {
      const finishedAt = clock();
      return {
        provider: key,
        healthy: false,
        status: "unhealthy",
        latencyMs: Math.max(0, Math.round(finishedAt - startedAt)),
        checkedAt: new Date(finishedAt).toISOString(),
        lastSuccessAt: lastSuccess.get(key) || null,
        failure: classifyProbeFailure(error),
        evidence: null
      };
    }
  }

  async function probeAll() {
    const results = await Promise.all(
      supportedProviders.map(provider => probeProvider(provider))
    );
    const healthyCount = results.filter(result => result.healthy).length;

    return {
      allHealthy: healthyCount === results.length,
      healthyCount,
      total: results.length,
      providers: Object.fromEntries(
        results.map(result => [result.provider, result])
      )
    };
  }

  return { probeProvider, probeAll, supportedProviders };
}

export const providerProbeRunner = createProviderProbeRunner();
