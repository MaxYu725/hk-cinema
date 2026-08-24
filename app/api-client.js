(() => {
  const ORIGIN = "https://hk-cinema-api.max-yu-jp.workers.dev";
  const DEFAULT_TIMEOUT_MS = 12000;
  const CACHE_OWNERS = Object.freeze({
    catalogue: "provider-adapter",
    showtimes: "provider-compare-main-cache",
    price: "provider-compare-prices",
    seatSummary: "provider-compare-seats",
    seatMap: "seatmap-shared",
    shell: "service-worker"
  });
  const nativeFetch = window.fetch.bind(window);

  class ApiError extends Error {
    constructor(message, { status = null, code = null, payload = null } = {}) {
      super(message);
      this.name = "HKCinemaApiError";
      this.status = status !== null && status !== undefined && status !== "" && Number.isFinite(Number(status))
        ? Number(status)
        : null;
      this.code = code || null;
      this.payload = payload || null;
    }
  }

  function url(path, query = null) {
    const target = new URL(String(path || "/"), ORIGIN);
    if (target.origin !== ORIGIN) {
      throw new ApiError("Worker request must stay on the configured API origin", {
        code: "INVALID_API_ORIGIN"
      });
    }
    if (query instanceof URLSearchParams) {
      target.search = query.toString();
    } else if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value === null || value === undefined || value === "") continue;
        target.searchParams.set(key, String(value));
      }
    }
    return target;
  }

  function requestSignal(parentSignal, timeoutMs) {
    const controller = new AbortController();
    const onAbort = () => {
      try { controller.abort(parentSignal?.reason || "parent-abort"); }
      catch { controller.abort(); }
    };
    if (parentSignal?.aborted) onAbort();
    else parentSignal?.addEventListener?.("abort", onAbort, { once: true });
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          try { controller.abort("timeout"); }
          catch { controller.abort(); }
        }, timeoutMs)
      : null;
    return {
      signal: controller.signal,
      cleanup() {
        if (timer !== null) clearTimeout(timer);
        parentSignal?.removeEventListener?.("abort", onAbort);
      }
    };
  }

  async function request(path, {
    method = "GET",
    query = null,
    signal = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = null
  } = {}) {
    const lifecycle = requestSignal(signal, timeoutMs);
    let response;
    try {
      response = await nativeFetch(url(path, query).toString(), {
        method,
        cache: "no-store",
        signal: lifecycle.signal,
        headers: { Accept: "application/json", ...(headers || {}) }
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        throw new ApiError(`Worker HTTP ${response.status}`, {
          status: response.status,
          code: "INVALID_JSON_RESPONSE"
        });
      }
      if (!response.ok || payload?.ok !== true) {
        throw new ApiError(payload?.error?.message || `Worker HTTP ${response.status}`, {
          status: response.status,
          code: payload?.error?.code || "WORKER_REQUEST_FAILED",
          payload
        });
      }
      return payload;
    } finally {
      lifecycle.cleanup();
    }
  }

  window.HKCinemaApiClient = Object.freeze({
    version: "c5-1",
    origin: ORIGIN,
    cacheOwners: CACHE_OWNERS,
    url,
    request,
    get(path, options = {}) {
      return request(path, { ...options, method: "GET" });
    },
    ApiError
  });
})();
