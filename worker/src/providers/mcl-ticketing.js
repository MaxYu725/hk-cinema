import {
  getMCLWebApiTicketing
} from "./mcl-webapi-ticketing.js";

const MCL_FETCH_TIMEOUT_FLOOR_MS = 9000;

function messageOf(error) {
  return error instanceof Error
    ? error.message
    : String(error || "MCL ticketing request failed");
}

function upstreamHttpStatus(message) {
  const match = String(message || "").match(/MCL WebAPI HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

export function classifyMCLTicketingFailure(error, elapsedMs = 0) {
  const message = messageOf(error);
  const duration = Number.isFinite(Number(elapsedMs))
    ? Math.max(0, Math.round(Number(elapsedMs)))
    : 0;
  const upstreamStatus = upstreamHttpStatus(message);
  const looksLikeNetworkFailure =
    error instanceof TypeError ||
    /fetch|network|dns|socket|connection/i.test(message);
  const looksLikeTimeout =
    error?.name === "AbortError" ||
    /abort|timeout|timed out|deadline/i.test(message) ||
    (looksLikeNetworkFailure && duration >= MCL_FETCH_TIMEOUT_FLOOR_MS);

  if (looksLikeTimeout) {
    return {
      code: "MCL_TICKETING_ERROR",
      causeCode: "MCL_UPSTREAM_TIMEOUT",
      category: "timeout",
      httpStatus: 504,
      upstreamStatus: null,
      elapsedMs: duration,
      message
    };
  }

  if (upstreamStatus === 403) {
    return {
      code: "MCL_TICKETING_ERROR",
      causeCode: "MCL_UPSTREAM_HTTP_ERROR",
      category: "blocked",
      httpStatus: 502,
      upstreamStatus,
      elapsedMs: duration,
      message
    };
  }

  if (upstreamStatus === 429) {
    return {
      code: "MCL_TICKETING_ERROR",
      causeCode: "MCL_UPSTREAM_HTTP_ERROR",
      category: "rate_limited",
      httpStatus: 502,
      upstreamStatus,
      elapsedMs: duration,
      message
    };
  }

  if (upstreamStatus !== null) {
    return {
      code: "MCL_TICKETING_ERROR",
      causeCode: "MCL_UPSTREAM_HTTP_ERROR",
      category: "http_error",
      httpStatus: 502,
      upstreamStatus,
      elapsedMs: duration,
      message
    };
  }

  if (/no recognizable sessions|invalid|parse|json/i.test(message)) {
    return {
      code: "MCL_TICKETING_ERROR",
      causeCode: "MCL_UPSTREAM_INVALID_PAYLOAD",
      category: "invalid_payload",
      httpStatus: 502,
      upstreamStatus: null,
      elapsedMs: duration,
      message
    };
  }

  if (looksLikeNetworkFailure) {
    return {
      code: "MCL_TICKETING_ERROR",
      causeCode: "MCL_UPSTREAM_NETWORK_ERROR",
      category: "network_error",
      httpStatus: 502,
      upstreamStatus: null,
      elapsedMs: duration,
      message
    };
  }

  return {
    code: "MCL_TICKETING_ERROR",
    causeCode: "MCL_UPSTREAM_ERROR",
    category: "upstream_error",
    httpStatus: 502,
    upstreamStatus: null,
    elapsedMs: duration,
    message
  };
}

export async function getMCLTicketing(movieSetId, selectedDate = null) {
  const startedAt = Date.now();

  try {
    return await getMCLWebApiTicketing(movieSetId, selectedDate);
  } catch (error) {
    const failure = classifyMCLTicketingFailure(
      error,
      Date.now() - startedAt
    );
    const wrapped = new Error(failure.message);
    Object.assign(wrapped, failure);
    throw wrapped;
  }
}
