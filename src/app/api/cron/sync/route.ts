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

    // Also check JSON body if POST
    if (request.method === "POST") {
      try {
        const body = await request.json();
        if (body.url) targetUrl = body.url;
        if (body.maxNewChapters !== undefined) maxNewChaptersParam = String(body.maxNewChapters);
      } catch {}
    }

    const maxNewChapters = maxNewChaptersParam ? parseInt(maxNewChaptersParam, 10) : 5;

    // Single manga sync
    if (targetUrl) {
      const result = await syncMangaFromUrl(targetUrl, { maxNewChapters });
      return NextResponse.json({
        success: true,
        type: "single",
        data: result,
      });
    }

    // Full watchlist sync
    const results = await syncAllWatchedMangas();
    const updatedScheduler = await recordSchedulerRun();

    return NextResponse.json({
      success: true,
      type: "all",
      totalMangaChecked: results.length,
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
