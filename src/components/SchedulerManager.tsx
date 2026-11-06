"use client";

import { useEffect, useRef } from "react";

export default function SchedulerManager() {
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkAndSchedule() {
      try {
        const res = await fetch("/api/scheduler");
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success || !json.data) return;

        const config = json.data;

        // Save to localStorage for instant UI sync
        localStorage.setItem("manga_scheduler_config", JSON.stringify(config));

        if (!config.enabled) {
          if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
            syncTimeoutRef.current = null;
          }
          return;
        }

        const now = Date.now();
        const nextSyncTime = config.nextSyncAt ? new Date(config.nextSyncAt).getTime() : now;
        const delay = Math.max(0, nextSyncTime - now);

        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }

        // If overdue (e.g. user just opened the site after missed interval)
        if (delay <= 1000) {
          await triggerBackgroundSync();
        } else {
          // Schedule for when due
          syncTimeoutRef.current = setTimeout(async () => {
            if (isMounted) {
              await triggerBackgroundSync();
            }
          }, Math.min(delay, 2147483647));
        }
      } catch (err) {
        console.error("SchedulerManager error:", err);
      }
    }

    async function triggerBackgroundSync() {
      // Prevent multi-tab concurrent stampede using timestamp lock (30s window)
      const lastRunning = parseInt(localStorage.getItem("manga_sync_running_lock") || "0", 10);
      if (Date.now() - lastRunning < 30000) {
        return; // Another tab is already syncing
      }

      localStorage.setItem("manga_sync_running_lock", String(Date.now()));

      try {
        const syncRes = await fetch("/api/cron/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (syncRes.ok) {
          const syncData = await syncRes.json();
          // Dispatch custom event for watchlist page to refresh its UI/logs
          window.dispatchEvent(
            new CustomEvent("manga-sync-finished", { detail: syncData })
          );
        }
      } catch (err) {
        console.error("Background sync error:", err);
      } finally {
        localStorage.removeItem("manga_sync_running_lock");
        // Check next schedule
        if (isMounted) {
          checkAndSchedule();
        }
      }
    }

    // Initial check
    checkAndSchedule();

    // Listen for manual toggles from Watchlist UI
    const handleSchedulerUpdated = () => {
      checkAndSchedule();
    };

    window.addEventListener("manga-scheduler-updated", handleSchedulerUpdated);
    window.addEventListener("storage", handleSchedulerUpdated);

    // Periodic heartbeat check every 1 minute to ensure timer stays on track
    const heartbeat = setInterval(checkAndSchedule, 60000);

    return () => {
      isMounted = false;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      clearInterval(heartbeat);
      window.removeEventListener("manga-scheduler-updated", handleSchedulerUpdated);
      window.removeEventListener("storage", handleSchedulerUpdated);
    };
  }, []);

  return null; // Invisible background worker
}
