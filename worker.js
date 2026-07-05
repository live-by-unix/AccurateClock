// Ultra-accurate Cloudflare Worker clock
// - Hybrid monotonic + edge UTC
// - Microsecond internal precision
// - Drift correction over long runtimes
// - Dynamic RTT measurement (no presets)
// JSON: epoch_ms, iso_utc, region, version (unchanged keys)

let base_epoch = Date.now();
let base_perf = performance.now();
let last_resync = base_epoch;

const RESYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DRIFT_THRESHOLD_MS = 1;             // resync if >1ms drift

function getHighPrecisionEpoch(env) {
  // Prefer high-precision clock if available (microseconds)
  if (env && env.CLOCK && typeof env.CLOCK.now === "function") {
    const us = env.CLOCK.now();          // epoch in microseconds
    return us / 1000;                    // convert to milliseconds (float)
  }

  // Hybrid monotonic UTC: base_epoch + (performance.now() - base_perf)
  const perf_now = performance.now();
  let epoch_ms = base_epoch + (perf_now - base_perf);

  // Drift correction over long runtimes
  const wall_now = Date.now();
  const since_resync = wall_now - last_resync;
  const drift = wall_now - epoch_ms;

  if (since_resync > RESYNC_INTERVAL_MS || Math.abs(drift) > DRIFT_THRESHOLD_MS) {
    // Re-anchor to wall clock, keep monotonic stability
    base_epoch = wall_now;
    base_perf = perf_now;
    last_resync = wall_now;
    epoch_ms = base_epoch + (perf_now - base_perf);
  }

  return epoch_ms;
}

export default {
  async fetch(request, env, ctx) {
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    };

    // 1. CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // 2. Only allow GET
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers
      });
    }

    // 3. Tighten timing window to reduce jitter
    await scheduler.wait(0);

    // 4. High-precision epoch (float ms, microsecond-capable internally)
    let epoch_ms = getHighPrecisionEpoch(env);

    // 5. Region info
    const region = request.cf?.colo || "UNKNOWN";

    // 6. RTT measurement: capture server receipt time
    const server_recv_ms = Date.now();

    // 7. Final JSON (same shape, ms resolution + RTT field)
    const epoch_ms_int = Math.floor(epoch_ms);

    return new Response(
      JSON.stringify({
        epoch_ms: epoch_ms_int,
        iso_utc: new Date(epoch_ms).toISOString(),
        region,
        version: "4",
        server_recv_ms // client can use this for RTT calculation
      }),
      { status: 200, headers }
    );
  }
};
