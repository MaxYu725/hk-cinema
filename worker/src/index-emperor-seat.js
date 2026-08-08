import emperorWorker from "./index-emperor.js";
import { getEmperorSeatMap } from "./providers/emperor-seat.js";

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...extraHeaders
    }
  });

function errorResponse(error, fallbackCode) {
  return json({
    ok: false,
    error: {
      code: error?.code || fallbackCode,
      message: error instanceof Error ? error.message : String(error)
    }
  }, Number.isFinite(error?.status) ? error.status : 502);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
            phase: "6E",
            provider: "emperor",
            scheduleId,
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
};
