/**
 * Local Auto-Sync Ticker (optional)
 * ----------------------------------------------------
 * Calls /api/cron/sync every 2 minutes — the same thing Supabase pg_cron does.
 * Only needed if you can't use pg_cron / cron-job.org (e.g. running fully locally).
 * The server decides whether a sync is actually due (on/off + interval set on /watchlist).
 *
 * Usage:  npm run sync:daemon
 * Env:    APP_URL (default http://localhost:3000), CRON_SECRET (required)
 */

// Load .env if present (Node >= 20.12)
try {
  process.loadEnvFile();
} catch {}

const BASE_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET;
const TICK_MS = 2 * 60 * 1000;

if (!CRON_SECRET) {
  console.error("❌ CRON_SECRET is not set. Add it to .env (same value as on the server).");
  process.exit(1);
}

console.log("==================================================");
console.log("  MANGA AUTO-SYNC TICKER");
console.log(`  Target: ${BASE_URL}/api/cron/sync  (every 2 minutes)`);
console.log("==================================================");

async function tick() {
  const ts = new Date().toLocaleString("th-TH");
  try {
    const res = await fetch(`${BASE_URL}/api/cron/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      console.error(`[${ts}] ❌ Unauthorized — CRON_SECRET doesn't match the server`);
    } else if (data.type === "skipped") {
      console.log(`[${ts}] ⏸️  skipped (${data.reason})`);
    } else if (data.success && Array.isArray(data.data)) {
      console.log(`[${ts}] ✅ synced ${data.data.length} manga in ${data.durationMs}ms`);
      for (const item of data.data) {
        console.log(
          item.success
            ? `   - [${item.title}] existing: ${item.skippedExistingChapters || 0} | new: ${item.newChaptersDownloaded || 0}`
            : `   - [${item.title}] error: ${item.error}`
        );
      }
    } else {
      console.error(`[${ts}] ❌ sync failed (${res.status}): ${data.error || "unknown error"}`);
    }
  } catch (err) {
    console.error(`[${ts}] ❌ connection error: ${err.message}`);
  }
}

tick();
setInterval(tick, TICK_MS);
