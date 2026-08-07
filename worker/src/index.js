export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "hk-cinema-api",
        phase: "0D",
        time: new Date().toISOString()
      });
    }

    return Response.json(
      {
        ok: false,
        error: "Not Found"
      },
      {
        status: 404
      }
    );
  }
};
