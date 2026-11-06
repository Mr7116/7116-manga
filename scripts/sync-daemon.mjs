/**
 * Manga Auto-Sync Daemon
 * ----------------------------------------------------
 * Runs in the background and periodically triggers /api/cron/sync
 * Respects the persistent scheduler state in the database.
 * 
 * Usage: node scripts/sync-daemon.mjs
 * Or: npm run sync:daemon
 */

const BASE_URL = process.env.APP_URL || "http://localhost:3000";

console.log("==================================================");
console.log("  MANGA AUTO-SYNC BACKGROUND DAEMON");
console.log(`  Target: ${BASE_URL}/api/cron/sync`);
console.log("  Syncing with persistent database scheduler state...");
console.log("==================================================");

let nextTimer = null;

async function checkAndRun() {
  const timestamp = new Date().toLocaleString("th-TH");

  try {
    // 1. Fetch current scheduler status from DB
    const schedRes = await fetch(`${BASE_URL}/api/scheduler`);
    if (!schedRes.ok) {
      console.error(`[${timestamp}] ⚠️ Could not fetch scheduler config (status ${schedRes.status})`);
      scheduleNext(30);
      return;
    }

    const schedJson = await schedRes.json();
    const config = schedJson.data || {};

    if (!config.enabled) {
      console.log(`[${timestamp}] ⏸️ Scheduler is currently OFF in system settings. Standing by (checking in 1 min)...`);
      scheduleNext(1);
      return;
    }

    const intervalMin = config.intervalMinutes || 30;
    console.log(`\n[${timestamp}] ⚡ Scheduler is ACTIVE (Every ${intervalMin} mins). Triggering manga sync...`);

    // 2. Trigger sync
    const res = await fetch(`${BASE_URL}/api/cron/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      console.error(`[${timestamp}] ❌ Sync failed with status: ${res.status}`);
      scheduleNext(intervalMin);
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
    }

    scheduleNext(intervalMin);
  } catch (err) {
    console.error(`[${timestamp}] ❌ Connection error:`, err.message);
    scheduleNext(1);
  }
}

function scheduleNext(minutes) {
  if (nextTimer) clearTimeout(nextTimer);
  nextTimer = setTimeout(checkAndRun, minutes * 60 * 1000);
}

// Start immediately
checkAndRun();
