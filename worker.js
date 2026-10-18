// AccurateClock Cloudflare Worker
// Hybrid monotonic UTC clock with integer microsecond timestamps.

let baseEpochUs = Date.now() * 1000;
let basePerf = performance.now();
let lastResyncMs = Date.now();

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;
const DRIFT_THRESHOLD_US = 1000;

function getEpochUs(env) {
  if (env?.CLOCK && typeof env.CLOCK.now === "function") {
    const value = env.CLOCK.now();

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }

    if (typeof value === "bigint") {
      return Number(value);
    }
  }

  const perfNow = performance.now();
  const wallNowMs = Date.now();

  let epochUs = baseEpochUs + (perfNow - basePerf) * 1000;

  const wallNowUs = wallNowMs * 1000;
  const sinceResyncMs = wallNowMs - lastResyncMs;
  const driftUs = wallNowUs - epochUs;

  if (
    sinceResyncMs >= RESYNC_INTERVAL_MS ||
    Math.abs(driftUs) > DRIFT_THRESHOLD_US
  ) {
    baseEpochUs = wallNowUs;
    basePerf = perfNow;
    lastResyncMs = wallNowMs;
    epochUs = baseEpochUs;
  }

  return Math.round(epochUs);
}

export default {
  async fetch(request, env) {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    if (request.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers
        }
      );
    }

    await scheduler.wait(0);

    const epochUs = getEpochUs(env);
    const serverRecvUs = Date.now() * 1000;

    const epochMs = Math.floor(epochUs / 1000);
    const serverRecvMs = Math.floor(serverRecvUs / 1000);

    return new Response(
      JSON.stringify({
        epoch_us: epochUs,
        server_recv_us: serverRecvUs,
        iso_utc: new Date(epochUs / 1000).toISOString(),
        region: request.cf?.colo || "UNKNOWN",
        version: "5",

        // Backward-compatible millisecond fields.
        epoch_ms: epochMs,
        server_recv_ms: serverRecvMs
      }),
      {
        status: 200,
        headers
      }
    );
  }
};
