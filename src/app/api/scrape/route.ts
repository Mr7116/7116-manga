import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { normalizeThaiUrl, scrapePage } from "@/lib/scraper";

export const maxDuration = 60;

// POST /api/scrape { url } -> series info, chapter list and/or chapter images
export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "กรุณาระบุ URL ที่ถูกต้อง" }, { status: 400 });
    }

    const normalizedUrl = normalizeThaiUrl(url);
    try {
      new URL(normalizedUrl);
    } catch (e: any) {
      return NextResponse.json({ error: `รูปแบบ URL ไม่ถูกต้อง: ${e.message}` }, { status: 400 });
    }

    const page = await scrapePage(normalizedUrl);

    return NextResponse.json({
      success: true,
      originalUrl: url,
      normalizedUrl,
      data: {
        title: page.title,
        rawTitle: page.rawTitle,
        cover: page.cover,
        synopsis: page.synopsis || "ไม่มีเรื่องย่อ",
        genres: page.genres,
        type: page.type,
        status: page.status,
        author: page.author,
        artist: page.artist,
        chapterNumber: page.chapterNumber,
        totalImagesFound: page.images.length,
        images: page.images,
        totalChaptersFound: page.chapters.length,
        chapters: page.chapters,
        nextUrl: page.nextUrl,
        prevUrl: page.prevUrl,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการดึงข้อมูลจาก URL" },
      { status: 500 }
    );
  }
}
