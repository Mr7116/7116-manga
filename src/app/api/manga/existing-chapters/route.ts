import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findMatchingMangaSlug } from "@/lib/mangaService";
import { slugFromUrl } from "@/lib/slug";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    let slug = searchParams.get("slug") || "";
    const url = searchParams.get("url") || "";
    const title = searchParams.get("title") || "";

    if (!slug && url) slug = slugFromUrl(url);

    if (!slug) {
      return NextResponse.json({ success: true, existingNumbers: [], total: 0 });
    }

    // Cross-source Smart Matching
    slug = await findMatchingMangaSlug(slug, title);

    // Find manga by slug and get only chapters that already have pages
    const manga = await prisma.manga.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        chapters: {
          where: {
            pages: { not: "[]" },
          },
          select: {
            number: true,
          },
        },
      },
    });

    if (!manga) {
      return NextResponse.json({ success: true, slug, existingNumbers: [], total: 0 });
    }

    const existingNumbers = manga.chapters.map((c) => c.number);

    return NextResponse.json({
      success: true,
      slug: manga.slug,
      title: manga.title,
      existingNumbers,
      total: existingNumbers.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch existing chapters" },
      { status: 500 }
    );
  }
}
