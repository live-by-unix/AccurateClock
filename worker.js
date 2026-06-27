export default {
  async fetch(request, env, ctx) {
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    };

    // 1. Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // 2. Only allow GET requests
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
    }

    // 3. Capture the edge receipt time (Highly accurate Stratum 2 synced time)
    const now = Date.now(); 

    return new Response(
      JSON.stringify({
        epoch_ms: now,
        iso_utc: new Date(now).toISOString(),
        region: request.cf?.colo || "UNKNOWN",
        version: "1"
      }),
      { status: 200, headers }
    );
  }
};
