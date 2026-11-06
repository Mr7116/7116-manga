/**
 * Manga Auto-Sync Daemon
 * ----------------------------------------------------
 * Runs in the background and periodically triggers /api/cron/sync
 * Usage: node scripts/sync-daemon.mjs
 * Or: npm run sync:daemon
 */

const BASE_URL = process.env.APP_URL || "http://localhost:3000";
const INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || "30", 10);
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

console.log("==================================================");
console.log("  MANGA AUTO-SYNC BACKGROUND DAEMON");
console.log(`  Target: ${BASE_URL}/api/cron/sync`);
console.log(`  Interval: Every ${INTERVAL_MINUTES} minutes`);
console.log("==================================================");

async function runSync() {
  const timestamp = new Date().toLocaleString("th-TH");
  console.log(`\n[${timestamp}] ⚡ Triggering scheduled manga sync...`);

  try {
    const res = await fetch(`${BASE_URL}/api/cron/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      console.error(`[${timestamp}] ❌ Sync failed with status: ${res.status}`);
      return;
    }

    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      console.log(`[${timestamp}] ✅ Sync finished! Total mangas checked: ${data.data.length}`);
      for (const item of data.data) {
        if (item.success) {
          console.log(
            `   - [${item.title}]: Skipped existing: ${item.skippedExistingChapters || 0} | Downloaded new: ${item.newChaptersDownloaded || 0}`
          );
        } else {
          console.log(`   - [${item.title}]: Error: ${item.error}`);
        }
      }
    } else {
      console.log(`[${timestamp}] ⚠️ Response:`, data);
    }
  } catch (err) {
    console.error(`[${timestamp}] ❌ Connection error:`, err.message);
  }
}

// Run once immediately on start
runSync();

// Schedule recurring loop
setInterval(runSync, INTERVAL_MS);
