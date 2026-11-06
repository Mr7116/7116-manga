import { NextRequest, NextResponse } from "next/server";
import { saveScrapedManga } from "@/lib/mangaService";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || !body.title) {
      return NextResponse.json(
        { error: "ข้อมูลมังงะไม่ครบถ้วน (ต้องมี title)" },
        { status: 400 }
      );
    }

    const result = await saveScrapedManga({
      url: body.url || "",
      seriesUrl: body.seriesUrl || undefined,
      slug: body.slug || undefined,
      title: body.title,
      cover: body.cover,
      synopsis: body.synopsis,
      images: body.images || [],
      chapters: body.chapters || [],
      chapterNumber: typeof body.chapterNumber === "number" ? body.chapterNumber : undefined,
      chapterTitle: body.chapterTitle || undefined,
    });

    return NextResponse.json({
      success: true,
      message: "บันทึกมังงะและตอนลงฐานข้อมูลสำเร็จ!",
      data: result,
    });
  } catch (error: any) {
    console.error("Save manga error:", error);
    return NextResponse.json(
      { error: error?.message || "ไม่สามารถบันทึกข้อมูลลงฐานข้อมูลได้" },
      { status: 500 }
    );
  }
}
