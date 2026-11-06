import { NextRequest, NextResponse } from "next/server";
import { saveScrapedManga } from "@/lib/mangaService";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    // Support both flat body and wrapped body ({ type, data, mangaSlug })
    const payload =
      rawBody && rawBody.data && typeof rawBody.data === "object"
        ? { ...rawBody.data, ...rawBody }
        : rawBody;

    const title = payload?.title || payload?.seriesTitle || payload?.mangaTitle;

    if (!payload || !title) {
      return NextResponse.json(
        { error: "ข้อมูลมังงะไม่ครบถ้วน (ต้องมี title)" },
        { status: 400 }
      );
    }

    const result = await saveScrapedManga({
      url: payload.url || "",
      seriesUrl: payload.seriesUrl || undefined,
      slug: payload.slug || payload.mangaSlug || undefined,
      title: title,
      cover: payload.cover,
      synopsis: payload.synopsis,
      images: payload.images || payload.pages || [],
      chapters: payload.chapters || [],
      chapterNumber: typeof payload.chapterNumber === "number" ? payload.chapterNumber : undefined,
      chapterTitle: payload.chapterTitle || undefined,
    });

    return NextResponse.json({
      success: true,
      message: "บันทึกมังงะและตอนลงฐานข้อมูลสำเร็จ!",
      data: result,
      manga: result?.manga,
    });
  } catch (error: any) {
    console.error("Save manga error:", error);
    return NextResponse.json(
      { error: error?.message || "ไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้" },
      { status: 500 }
    );
  }
}
