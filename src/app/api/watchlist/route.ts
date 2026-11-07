import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeThaiUrl, syncMangaFromUrl } from "@/lib/syncService";
import { slugFromUrl } from "@/lib/slug";
import { requireAuth } from "@/lib/auth";

export const maxDuration = 60;

// GET /api/watchlist - List all watched mangas
export async function GET(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const list = await prisma.watchedManga.findMany({
      orderBy: { updatedAt: "desc" },
    });

    // One query for all related manga (was one query per watched item)
    const slugs = Array.from(new Set(list.map((i) => i.slug).filter(Boolean)));
    const mangas = slugs.length
      ? await prisma.manga.findMany({
          where: { slug: { in: slugs } },
          select: {
            slug: true,
            latestChapter: true,
            _count: { select: { chapters: true } },
          },
        })
      : [];
    const bySlug = new Map(mangas.map((m) => [m.slug, m]));

    const enrichedList = list.map((item) => {
      const manga = bySlug.get(item.slug);
      return {
        ...item,
        totalChaptersInDb: manga?._count?.chapters || 0,
        latestChapterInDb: manga?.latestChapter || item.latestChapterInDb || 0,
      };
    });

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

// POST /api/watchlist - Add a URL or list of URLs to watchlist
export async function POST(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();

    // BULK URL IMPORT: Queue multiple URLs directly into database
    if (Array.isArray(body.urls) && body.urls.length > 0) {
      const validUrls: string[] = Array.from(
        new Set<string>(
          body.urls
            .map((u: any) => (typeof u === "string" ? u.trim() : ""))
            .filter((u: string) => u.startsWith("http://") || u.startsWith("https://"))
        )
      );

      if (validUrls.length === 0) {
        return NextResponse.json(
          { success: false, error: "ไม่พบ URL ที่ถูกต้องในรายการที่ส่งมา" },
          { status: 400 }
        );
      }

      const createdItems = [];
      for (const raw of validUrls) {
        const safeUrl = normalizeThaiUrl(raw);
        const slug = slugFromUrl(safeUrl);

        const item = await prisma.watchedManga.upsert({
          where: { url: safeUrl },
          create: {
            url: safeUrl,
            slug: slug || "pending-import",
            title: slug ? slug.replace(/-/g, " ") : safeUrl,
            status: "active",
            latestChapterOnWeb: 0,
            latestChapterInDb: 0,
            lastSyncedAt: null, // Priority: cron will process these first!
          },
          update: {
            status: "active",
          },
        });
        createdItems.push(item);
      }

      return NextResponse.json({
        success: true,
        message: `เพิ่ม ${createdItems.length} เรื่องเข้าคิวระบบหลังบ้านเรียบร้อยแล้ว`,
        count: createdItems.length,
        data: createdItems,
      });
    }

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
        maxNewChapters: typeof maxNewChapters === "number" ? maxNewChapters : 3,
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

    // Otherwise, create placeholder or save provided metadata
    const watchedItem = await prisma.watchedManga.upsert({
      where: { url: safeUrl },
      create: {
        url: safeUrl,
        slug: body.slug || "",
        title: body.title || safeUrl,
        cover: body.cover || null,
        status: "active",
        latestChapterOnWeb: typeof body.latestChapterOnWeb === "number" ? body.latestChapterOnWeb : 0,
        latestChapterInDb: typeof body.latestChapterInDb === "number" ? body.latestChapterInDb : 0,
      },
      update: {
        slug: body.slug ? body.slug : undefined,
        title: body.title ? body.title : undefined,
        cover: body.cover ? body.cover : undefined,
        latestChapterOnWeb: typeof body.latestChapterOnWeb === "number" ? body.latestChapterOnWeb : undefined,
        latestChapterInDb: typeof body.latestChapterInDb === "number" ? body.latestChapterInDb : undefined,
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
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !["active", "paused"].includes(status)) {
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
  const denied = requireAuth(request);
  if (denied) return denied;

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
