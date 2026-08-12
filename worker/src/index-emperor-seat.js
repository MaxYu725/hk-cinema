import emperorWorker from "./index-emperor.js";
import { getEmperorSeatMap } from "./providers/emperor-seat-bounds.js";
import { createCineArtCatalogueService } from "./providers/cineart-catalogue.js";
import { discoverCineArtDataSources } from "./providers/cineart-source.js";
import {
  providerProbeRunner,
  PROBEABLE_PROVIDERS
} from "./provider-probe.js";

const GEOMETRY_VERSION = "6e1-bounds-v2";

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...extraHeaders
    }
  });

function errorResponse(error, fallbackCode, extraHeaders = {}) {
  return json({
    ok: false,
    error: {
      code: error?.code || fallbackCode,
      message: error instanceof Error ? error.message : String(error)
    }
  }, Number.isFinite(error?.status) ? error.status : 502, extraHeaders);
}

async function routeRequest(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/cineart/catalogue") {
      try {
        const catalogue = await createCineArtCatalogueService().get({ ctx });
        return json({
          ok: true,
          data: catalogue,
          meta: {
            phase: "M7C",
            provider: "cineart",
            mode: "normalized-catalogue",
            cache: catalogue.meta?.cache === true,
            stale: catalogue.meta?.stale === true,
            cacheState: catalogue.meta?.cacheState || "network",
            updatedAt: catalogue.meta?.updatedAt || new Date().toISOString()
          }
        }, 200, {
          "cache-control": "no-store",
          "x-hkcinema-upstream-cache": catalogue.meta?.cacheState || "network"
        });
      } catch (error) {
        return errorResponse(
          error,
          "CINEART_CATALOGUE_ERROR",
          { "cache-control": "no-store" }
        );
      }
    }

    if (url.pathname === "/api/providers/cineart/discovery") {
      try {
        const result = await discoverCineArtDataSources();
        return json({
          ok: true,
          data: result,
          meta: {
            phase: "M7B",
            mode: "candidate-data-source-discovery",
            updatedAt: new Date().toISOString()
          }
        }, 200, { "cache-control": "no-store" });
      } catch (error) {
        return errorResponse(
          error,
          "CINEART_DISCOVERY_ERROR",
          { "cache-control": "no-store" }
        );
      }
    }

    if (url.pathname === "/api/providers/probe") {
      const result = await providerProbeRunner.probeAll();
      return json({
        ok: true,
        data: result,
        meta: {
          phase: "10R2B",
          mode: "live-provider-probe",
          updatedAt: new Date().toISOString()
        }
      }, 200, { "cache-control": "no-store" });
    }

    const providerProbeMatch = url.pathname.match(
      /^\/api\/providers\/probe\/([^/]+)$/
    );

    if (providerProbeMatch) {
      const provider = decodeURIComponent(providerProbeMatch[1]).toLowerCase();

      if (!PROBEABLE_PROVIDERS.includes(provider)) {
        return json({
          ok: false,
          error: {
            code: "INVALID_PROVIDER",
            message: `provider must be one of: ${PROBEABLE_PROVIDERS.join(", ")}`
          }
        }, 400, { "cache-control": "no-store" });
      }

      const result = await providerProbeRunner.probeProvider(provider);
      return json({
        ok: true,
        data: result,
        meta: {
          phase: provider === "cineart" ? "M7A" : "10R2B",
          mode: provider === "cineart" ? "candidate-provider-probe" : "live-provider-probe",
          updatedAt: new Date().toISOString()
        }
      }, 200, { "cache-control": "no-store" });
    }

    if (url.pathname === "/api/emperor/seatmap-health") {
      return json({
        ok: true,
        data: {
          provider: "emperor",
          phase: "6G",
          geometryVersion: GEOMETRY_VERSION
        },
        meta: {
          updatedAt: new Date().toISOString()
        }
      }, 200, { "cache-control": "no-store" });
    }

    const seatMatch = url.pathname.match(
      /^\/api\/emperor\/shows\/(\d+)\/seats$/
    );

    if (seatMatch) {
      const scheduleId = seatMatch[1];
      const scheduleKey = url.searchParams.get("scheduleKey") || "";
      const cinemaLinkId = url.searchParams.get("cinemaLinkId") || "";
      const hallId = url.searchParams.get("hallId") || "";

      try {
        const result = await getEmperorSeatMap({
          scheduleId,
          scheduleKey,
          cinemaLinkId,
          hallId
        });

        return json({
          ok: true,
          data: result,
          meta: {
            phase: "6G",
            provider: "emperor",
            scheduleId,
            geometryVersion: result.geometryVersion || GEOMETRY_VERSION,
            source: result.source,
            updatedAt: new Date().toISOString()
          }
        }, 200, {
          "cache-control": "public, max-age=30"
        });
      } catch (error) {
        return errorResponse(error, "EMPEROR_SEATMAP_ERROR");
      }
    }

    return emperorWorker.fetch(request, env, ctx);
}

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
  async fetch(request, env, ctx) {
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
        status: 500,
        durationMs,
        colo: request.cf?.colo || null,
        error: error instanceof Error ? error.message : String(error)
      });
      return addTelemetryHeaders(
        errorResponse(error, "UNHANDLED_WORKER_ERROR"),
        id,
        durationMs
      );
    }
  }
};
