import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeThaiUrl, syncMangaFromUrl } from "@/lib/syncService";

// GET /api/watchlist - List all watched mangas
export async function GET() {
  try {
    const list = await prisma.watchedManga.findMany({
      orderBy: { updatedAt: "desc" },
    });

    // Also get real-time chapter count in DB for each watched manga
    const enrichedList = await Promise.all(
      list.map(async (item) => {
        const manga = await prisma.manga.findUnique({
          where: { slug: item.slug },
          select: {
            id: true,
            _count: { select: { chapters: true } },
          },
        });

        return {
          ...item,
          totalChaptersInDb: manga?._count?.chapters || item.latestChapterInDb || 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enrichedList,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch watchlist" },
      { status: 500 }
    );
  }
}

// POST /api/watchlist - Add a URL to watchlist
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawUrl = body.url;
    const scanNow = body.scanNow ?? true;
    const maxNewChapters = body.maxNewChapters;

    if (!rawUrl || typeof rawUrl !== "string") {
      return NextResponse.json(
        { success: false, error: "กรุณาระบุ URL ของมังงะ" },
        { status: 400 }
      );
    }

    const safeUrl = normalizeThaiUrl(rawUrl);

    // If scanNow is requested, perform incremental sync immediately
    if (scanNow) {
      const syncResult = await syncMangaFromUrl(safeUrl, {
        maxNewChapters: typeof maxNewChapters === "number" ? maxNewChapters : undefined,
      });

      const watchedItem = await prisma.watchedManga.findUnique({
        where: { url: safeUrl },
      });

      return NextResponse.json({
        success: true,
        message: `เพิ่มและซิงค์ข้อมูลเรียบร้อยแล้ว`,
        data: watchedItem,
        syncResult,
      });
    }

    // Otherwise, create placeholder or basic check
    const watchedItem = await prisma.watchedManga.upsert({
      where: { url: safeUrl },
      create: {
        url: safeUrl,
        slug: "",
        title: safeUrl,
        status: "active",
      },
      update: {
        status: "active",
      },
    });

    return NextResponse.json({
      success: true,
      message: "เพิ่ม URL ในรายการติดตามแล้ว",
      data: watchedItem,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to add URL to watchlist" },
      { status: 500 }
    );
  }
}

// PATCH /api/watchlist - Update status (active / paused)
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Missing id or status" },
        { status: 400 }
      );
    }

    const updated = await prisma.watchedManga.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update watchlist item" },
      { status: 500 }
    );
  }
}

// DELETE /api/watchlist - Delete from watchlist
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const url = searchParams.get("url");

    if (!id && !url) {
      return NextResponse.json(
        { success: false, error: "Missing id or url parameter" },
        { status: 400 }
      );
    }

    if (id) {
      await prisma.watchedManga.delete({ where: { id } });
    } else if (url) {
      await prisma.watchedManga.delete({ where: { url: normalizeThaiUrl(url) } });
    }

    return NextResponse.json({
      success: true,
      message: "ลบออกจากรายการติดตามเรียบร้อยแล้ว",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete watchlist item" },
      { status: 500 }
    );
  }
}
