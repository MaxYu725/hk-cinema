const CINEART_PROBE_URL = "https://cinearthouse.com.hk/hk";
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_MAX_BYTES = 1024 * 1024;

const CINEMA_MARKERS = Object.freeze([
  Object.freeze({ key: "maritime-square", patterns: ["青衣城", "Maritime Square"] }),
  Object.freeze({ key: "jp", patterns: ["翡翠明珠", "JP"] }),
  Object.freeze({ key: "megabox", patterns: ["MegaBox"] }),
  Object.freeze({ key: "hollywood", patterns: ["荷里活", "Hollywood"] }),
  Object.freeze({ key: "mostown", patterns: ["新港城中心", "MOSTown"] })
]);

function probeError(code, message, status = null) {
  const error = new Error(message);
  error.code = code;
  if (Number.isFinite(status)) error.status = status;
  return error;
}

function boundedPositiveInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

async function readBoundedText(response, maxBytes) {
  const advertisedLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    throw probeError(
      "PROBE_PAYLOAD_TOO_LARGE",
      `CineArt probe payload exceeded ${maxBytes} bytes`
    );
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw probeError(
        "PROBE_PAYLOAD_TOO_LARGE",
        `CineArt probe payload exceeded ${maxBytes} bytes`
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("cineart-probe-payload-too-large").catch(() => {});
        throw probeError(
          "PROBE_PAYLOAD_TOO_LARGE",
          `CineArt probe payload exceeded ${maxBytes} bytes`
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

function detectCinemas(html) {
  return CINEMA_MARKERS
    .filter(cinema => cinema.patterns.some(pattern => html.includes(pattern)))
    .map(cinema => cinema.key);
}

export async function probeCineArt({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES
} = {}) {
  const boundedTimeout = boundedPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS, 500, DEFAULT_TIMEOUT_MS);
  const boundedMaxBytes = boundedPositiveInteger(maxBytes, DEFAULT_MAX_BYTES, 16 * 1024, DEFAULT_MAX_BYTES);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("cineart-provider-probe-timeout"), boundedTimeout);

  try {
    const response = await fetchImpl(CINEART_PROBE_URL, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-HK,zh-TW;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; HKCinemaProviderProbe/M7A)"
      }
    });

    if (!response.ok) {
      throw probeError(
        "PROBE_HTTP_ERROR",
        `CineArt probe returned HTTP ${response.status}`,
        response.status
      );
    }

    const text = await readBoundedText(response, boundedMaxBytes);
    const brandDetected = /影藝戲院|CineArt/i.test(text);
    const cinemas = detectCinemas(text);

    if (!brandDetected || cinemas.length < 3) {
      throw probeError(
        "PROBE_INVALID_PAYLOAD",
        "CineArt probe response did not contain the expected current site/cinema structure"
      );
    }

    return {
      evidence: "site-shell-cinema-directory",
      source: "cinearthouse-hk",
      cinemaCount: cinemas.length,
      cinemas,
      nextJsDetected: /\/_next\/|self\.__next_f\.push|__NEXT_DATA__/i.test(text),
      bytes: new TextEncoder().encode(text).byteLength,
      finalUrl: response.url || CINEART_PROBE_URL
    };
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw probeError("PROBE_TIMEOUT", "CineArt provider probe timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const CINEART_PROBE_CONFIG = Object.freeze({
  url: CINEART_PROBE_URL,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxBytes: DEFAULT_MAX_BYTES,
  cinemaMarkers: CINEMA_MARKERS
});
