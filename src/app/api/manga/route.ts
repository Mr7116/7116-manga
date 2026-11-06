import { NextRequest, NextResponse } from "next/server";
import { getAllMangas } from "@/lib/mangaService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const genre = searchParams.get("genre") || undefined;
    const status = searchParams.get("status") || undefined;
    const type = searchParams.get("type") || undefined;
    const search = searchParams.get("search") || undefined;

    const mangas = await getAllMangas({ genre, status, type, search });

    return NextResponse.json({
      success: true,
      total: mangas.length,
      data: mangas,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการดึงข้อมูลมังงะ" },
      { status: 500 }
    );
  }
}
