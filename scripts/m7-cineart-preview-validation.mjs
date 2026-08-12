const BASE_URL = String(process.env.HK_CINEMA_CANDIDATE_WORKER_URL || "")
  .trim()
  .replace(/\/+$/, "");
const MAX_ATTEMPTS = 12;
const RETRY_MS = 5000;

if (!BASE_URL) {
  throw new Error("HK_CINEMA_CANDIDATE_WORKER_URL is required");
}

const endpoint = `${BASE_URL}/api/providers/probe/cineart`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastFailure = "no attempt completed";

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok || payload?.ok !== true) {
      throw new Error(
        payload?.error?.message || `HTTP ${response.status}`
      );
    }

    const result = payload?.data;
    if (
      result?.provider !== "cineart" ||
      result?.healthy !== true ||
      result?.evidence?.source !== "cinearthouse-hk" ||
      result?.evidence?.evidence !== "site-shell-cinema-directory" ||
      Number(result?.evidence?.cinemaCount) < 3
    ) {
      throw new Error(`unhealthy/invalid CineArt probe: ${JSON.stringify(result)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      endpoint,
      attempt,
      provider: result.provider,
      latencyMs: result.latencyMs,
      cinemaCount: result.evidence.cinemaCount,
      cinemas: result.evidence.cinemas,
      nextJsDetected: result.evidence.nextJsDetected,
      checkedAt: result.checkedAt
    }, null, 2));
    process.exit(0);
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : String(error);
    if (attempt < MAX_ATTEMPTS) {
      console.log(`CineArt preview attempt ${attempt}/${MAX_ATTEMPTS} not ready: ${lastFailure}`);
      await sleep(RETRY_MS);
    }
  }
}

throw new Error(
  `CineArt branch-preview validation failed after ${MAX_ATTEMPTS} attempts: ${lastFailure}`
);
