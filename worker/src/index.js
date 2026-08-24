import { json, routeRequest } from "./router.js";

function requestId(request) {
  return request.headers.get("cf-ray") || crypto.randomUUID();
}

function logRequest(level, fields) {
  const message = JSON.stringify({
    message: "request_complete",
    ...fields
  });
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.log(message);
}

function addTelemetryHeaders(response, id, durationMs) {
  const decorated = new Response(response.body, response);
  decorated.headers.set("x-request-id", id);
  decorated.headers.set("server-timing", `worker;dur=${durationMs}`);
  decorated.headers.set(
    "access-control-expose-headers",
    "x-request-id, server-timing"
  );
  return decorated;
}

export default {
  async fetch(request, env = {}, ctx = null) {
    const startedAt = Date.now();
    const id = requestId(request);
    const url = new URL(request.url);
    try {
      const response = await routeRequest(request, env, ctx);
      const durationMs = Date.now() - startedAt;
      logRequest(
        response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info",
        {
          requestId: id,
          method: request.method,
          path: url.pathname,
          routeOwner: "worker-router",
          status: response.status,
          durationMs,
          colo: request.cf?.colo || null
        }
      );
      return addTelemetryHeaders(response, id, durationMs);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      logRequest("error", {
        requestId: id,
        method: request.method,
        path: url.pathname,
        routeOwner: "worker-router",
        status: 500,
        durationMs,
        colo: request.cf?.colo || null,
        error: error instanceof Error ? error.message : String(error)
      });
      return addTelemetryHeaders(
        json({
          ok: false,
          error: {
            code: "UNHANDLED_WORKER_ERROR",
            message: error instanceof Error ? error.message : String(error)
          }
        }, 500),
        id,
        durationMs
      );
    }
  }
};
