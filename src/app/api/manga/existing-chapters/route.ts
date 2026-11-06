import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugify, findMatchingMangaSlug } from "@/lib/mangaService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let slug = searchParams.get("slug") || "";
    const url = searchParams.get("url") || "";
    const title = searchParams.get("title") || "";

    if (!slug && url) {
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/").filter(Boolean);
        if (pathParts.length > 0) {
          let candidate = decodeURIComponent(pathParts[0]);
          candidate = candidate.replace(/[-_](?:ตอนที่|ตอน|chapter|ch|ep)[-_]?\d+.*$/i, "");
          slug = slugify(candidate);
        }
      } catch {}
    }

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
