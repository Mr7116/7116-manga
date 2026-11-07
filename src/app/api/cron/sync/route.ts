import { NextResponse } from "next/server";
import { syncAllWatchedMangas, syncMangaFromUrl } from "@/lib/syncService";
import { recordSchedulerRun, getSchedulerConfig } from "@/lib/schedulerService";

export const maxDuration = 60;

// GET or POST /api/cron/sync
export async function GET(request: Request) {
  return handleSync(request);
}

export async function POST(request: Request) {
  return handleSync(request);
}

async function handleSync(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let targetUrl = searchParams.get("url");
    let maxNewChaptersParam = searchParams.get("maxNewChapters");
    let limitParam = searchParams.get("limit");

    // Also check JSON body if POST
    if (request.method === "POST") {
      try {
        const body = await request.json();
        if (body.url) targetUrl = body.url;
        if (body.maxNewChapters !== undefined) maxNewChaptersParam = String(body.maxNewChapters);
        if (body.limit !== undefined) limitParam = String(body.limit);
      } catch {}
    }

    const maxNewChapters = maxNewChaptersParam ? parseInt(maxNewChaptersParam, 10) : 2;
    let limit = 2; // Default 2 mangas per cron run for sub-3s response!
    if (limitParam === "all" || limitParam === "0") {
      limit = 0; // all
    } else if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed)) limit = parsed;
    }

    // Single manga sync (explicitly requested by user)
    if (targetUrl) {
      const result = await syncMangaFromUrl(targetUrl, { maxNewChapters, forceBump: true });
      return NextResponse.json({
        success: true,
        type: "single",
        data: result,
      });
    }

    // Incremental batch sync (oldest synced first)
    const results = await syncAllWatchedMangas({ maxNewChapters, limit });
    const updatedScheduler = await recordSchedulerRun();

    return NextResponse.json({
      success: true,
      type: "all",
      syncedInThisBatch: results.length,
      scheduler: updatedScheduler,
      data: results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Sync execution failed",
      },
      { status: 500 }
    );
  }
}
