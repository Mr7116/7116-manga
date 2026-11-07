import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  acquireSyncLock,
  releaseSyncLock,
  syncAllWatchedMangas,
  syncMangaFromUrl,
  SYNC_MAX_NEW_CHAPTERS,
} from "@/lib/syncService";
import { getSchedulerConfig, isSyncDue, recordSchedulerRun } from "@/lib/schedulerService";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/sync
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this automatically
 *       when CRON_SECRET is set) or a logged-in admin cookie.
 *
 * - Scheduled tick (no params): runs only if the scheduler is enabled and due.
 * - { force: true }            : run a batch now regardless of schedule (watchlist "sync all" button).
 * - { url }                    : sync one manga now.
 * - { limit, maxNewChapters }  : optional overrides ("all" or 0 = whole watchlist).
 */
export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}

async function handleSync(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  let targetUrl = searchParams.get("url");
  let maxNewChaptersParam = searchParams.get("maxNewChapters");
  let limitParam = searchParams.get("limit");
  let force = searchParams.get("force") === "1" || searchParams.get("force") === "true";

  if (request.method === "POST") {
    try {
      const body = await request.json();
      if (body.url) targetUrl = body.url;
      if (body.maxNewChapters !== undefined) maxNewChaptersParam = String(body.maxNewChapters);
      if (body.limit !== undefined) limitParam = String(body.limit);
      if (body.force === true) force = true;
    } catch {}
  }

  const maxNewChapters = maxNewChaptersParam ? parseInt(maxNewChaptersParam, 10) : SYNC_MAX_NEW_CHAPTERS;
  let limit: number | undefined;
  if (limitParam === "all" || limitParam === "0") limit = 0;
  else if (limitParam && !isNaN(parseInt(limitParam, 10))) limit = parseInt(limitParam, 10);

  // Scheduled ticks respect the on/off switch and interval set on /watchlist
  if (!targetUrl && !force) {
    const config = await getSchedulerConfig();
    if (!isSyncDue(config)) {
      return NextResponse.json({
        success: true,
        type: "skipped",
        reason: config.enabled ? "not_due" : "scheduler_disabled",
        scheduler: config,
      });
    }
  }

  const lock = await acquireSyncLock();
  if (!lock) {
    return NextResponse.json(
      { success: true, type: "skipped", reason: "another_sync_running" },
      { status: 202 }
    );
  }

  const startedAt = new Date();
  try {
    if (targetUrl) {
      const result = await syncMangaFromUrl(targetUrl, { maxNewChapters, forceBump: true });
      return NextResponse.json({ success: true, type: "single", data: result });
    }

    const results = await syncAllWatchedMangas({ maxNewChapters, limit });
    const scheduler = await recordSchedulerRun(startedAt);

    return NextResponse.json({
      success: true,
      type: "all",
      syncedInThisBatch: results.length,
      durationMs: Date.now() - startedAt.getTime(),
      scheduler,
      data: results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Sync execution failed" },
      { status: 500 }
    );
  } finally {
    await releaseSyncLock(lock).catch(() => {});
  }
}
