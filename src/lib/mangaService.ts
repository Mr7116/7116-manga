import { prisma } from "./prisma";
import { seedDatabaseIfEmpty } from "./seed";

export interface CleanManga {
  id: string;
  slug: string;
  title: string;
  thaiTitle?: string | null;
  cover: string;
  banner?: string | null;
  synopsis: string;
  status: "Ongoing" | "Completed";
  type: "MANHWA" | "MANHUA" | "MANGA";
  isColor: boolean;
  genres: string[];
  rating: number;
  ratingCount: number;
  views: string;
  author: string;
  artist: string;
  latestChapter: number;
  updatedAt: string;
  chapters: CleanChapter[];
}

export interface CleanChapter {
  id: string;
  number: number;
  title: string;
  releaseDate: string;
  pages: string[];
}

// Convert Prisma model to UI CleanManga
function formatManga(m: any): CleanManga {
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    thaiTitle: m.thaiTitle,
    cover: m.cover,
    banner: m.banner || m.cover,
    synopsis: m.synopsis || "ไม่มีเรื่องย่อ",
    status: (m.status as "Ongoing" | "Completed") || "Ongoing",
    type: (m.type as "MANHWA" | "MANHUA" | "MANGA") || "MANHWA",
    isColor: m.isColor ?? true,
    genres: m.genres ? m.genres.split(",").map((g: string) => g.trim()) : [],
    rating: m.rating || 8.0,
    ratingCount: m.ratingCount || 100,
    views: m.views || "1.0K",
    author: m.author || "Unknown",
    artist: m.artist || "Unknown",
    latestChapter: m.latestChapter || 1,
    updatedAt: "อัปเดตล่าสุด",
    chapters: (m.chapters || []).map((c: any) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      releaseDate: c.releaseDate,
      pages: typeof c.pages === "string" ? JSON.parse(c.pages || "[]") : c.pages,
    })),
  };
}

// Helper to create slug from title or URL
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u0E00-\u0E7F-]/g, "") // Keep alphanumeric and Thai
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function getAllMangas(filter?: {
  genre?: string;
  status?: string;
  type?: string;
  search?: string;
}): Promise<CleanManga[]> {
  await seedDatabaseIfEmpty();

  const where: any = {};

  if (filter?.status && filter.status !== "Status ทั้งหมด") {
    if (filter.status === "จบแล้ว") where.status = "Completed";
    if (filter.status === "ยังไม่จบ") where.status = "Ongoing";
  }

  if (filter?.type && filter.type !== "Type ทั้งหมด") {
    where.type = filter.type;
  }

  if (filter?.search && filter.search.trim()) {
    where.OR = [
      { title: { contains: filter.search.trim() } },
      { thaiTitle: { contains: filter.search.trim() } },
      { genres: { contains: filter.search.trim() } },
    ];
  }

  const mangas = await prisma.manga.findMany({
    where,
    include: {
      chapters: {
        orderBy: { number: "desc" },
        take: 3, // latest chapters for card display
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  let formatted = mangas.map(formatManga);

  if (filter?.genre && filter.genre !== "Genre All" && filter.genre !== "ทั้งหมด") {
    formatted = formatted.filter((m) => m.genres.includes(filter.genre!));
  }

  return formatted;
}

export async function getMangaBySlug(slug: string): Promise<CleanManga | null> {
  await seedDatabaseIfEmpty();

  const manga = await prisma.manga.findUnique({
    where: { slug },
    include: {
      chapters: {
        orderBy: { number: "desc" },
      },
    },
  });

  if (!manga) return null;
  return formatManga(manga);
}

export async function getChapter(
  slug: string,
  chapterNumber: number
): Promise<{ manga: CleanManga; chapter: CleanChapter } | null> {
  await seedDatabaseIfEmpty();

  const manga = await getMangaBySlug(slug);
  if (!manga) return null;

  const chapter = manga.chapters.find((c) => c.number === chapterNumber);
  if (!chapter) return null;

  return { manga, chapter };
}

// SAVE SCRAPED MANGA & CHAPTER TO DATABASE
export async function saveScrapedManga(data: {
  url: string;
  seriesUrl?: string;
  slug?: string;
  title: string;
  cover?: string;
  synopsis?: string;
  images?: string[];
  chapters?: { title: string; url: string }[];
  chapterNumber?: number;
  chapterTitle?: string;
}): Promise<{ manga: CleanManga; chapterNumber?: number }> {
  await seedDatabaseIfEmpty();

  // Extract or generate slug from URL or title
  let slug = data.slug || "";
  if (!slug) {
    try {
      const target = data.seriesUrl || data.url;
      const urlObj = new URL(target);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        let candidate = decodeURIComponent(pathParts[0]);
        // Remove chapter suffix from slug e.g. "third-rate-martial-family-ตอนที่-1" -> "third-rate-martial-family"
        candidate = candidate
          .replace(/[-_](?:ตอนที่|ตอน|chapter|ch|ep)[-_]?\d+.*$/i, "");
        slug = slugify(candidate);
      }
    } catch {}
  }

  if (!slug) {
    slug = slugify(data.title.replace(/ตอนที่\s*\d+.*/i, ""));
  }

  // Determine chapter number if URL is a chapter page
  let chapterNumber: number | null = null;
  let chapterTitle = "ตอนที่ 1";

  // Check explicit chapterNumber first
  if (typeof data.chapterNumber === "number") {
    chapterNumber = data.chapterNumber;
    chapterTitle = data.chapterTitle || `ตอนที่ ${chapterNumber}`;
  }

  let decodedUrl = data.url;
  try {
    decodedUrl = decodeURIComponent(data.url);
  } catch {}

  if (chapterNumber === null) {
    const chMatch = decodedUrl.match(/ตอนที่-(\d+(\.\d+)?)|ตอนที่\s*(\d+(\.\d+)?)|chapter-(\d+(\.\d+)?)|ep-(\d+(\.\d+)?)/i);
    if (chMatch) {
      const numStr = chMatch[1] || chMatch[3] || chMatch[5] || chMatch[7];
      if (numStr) {
        chapterNumber = parseFloat(numStr);
        chapterTitle = data.chapterTitle || `ตอนที่ ${chapterNumber}`;
      }
    }
  }

  // Also check title for chapter number if not in URL
  if (chapterNumber === null) {
    const titleMatch = data.title.match(/ตอนที่\s*(\d+(\.\d+)?)/i);
    if (titleMatch && titleMatch[1]) {
      chapterNumber = parseFloat(titleMatch[1]);
      chapterTitle = data.chapterTitle || `ตอนที่ ${chapterNumber}`;
    }
  }

  // Clean series title (remove "ตอนที่ XX", "| Go-Manga", etc.)
  const cleanSeriesTitle = data.title
    .replace(/ตอนที่\s*\d+.*$/i, "")
    .replace(/\|\s*Go-Manga.*$/i, "")
    .replace(/\|\s*.*$/, "")
    .trim();

  // Check existing manga record first to protect cover art from being overwritten by chapter pages
  const existingManga = await prisma.manga.findUnique({ where: { slug } });

  // Only update cover if manga doesn't have a cover yet, or if importing from series page
  const isChapterUrl = /ตอนที่|chapter|ep-/i.test(data.url);
  const shouldUpdateCover = !existingManga?.cover || !isChapterUrl;

  // Upsert Manga
  const mangaRecord = await prisma.manga.upsert({
    where: { slug },
    create: {
      slug,
      title: cleanSeriesTitle || data.title,
      thaiTitle: cleanSeriesTitle,
      cover: data.cover || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600",
      synopsis: data.synopsis || "มังงะนำเข้าจาก Go-Manga",
      status: "Ongoing",
      type: "MANHWA",
      isColor: true,
      genres: "Action,Fantasy,พระเอกเทพ",
      rating: 8.5,
      ratingCount: 150,
      views: "1.2K",
      author: "7116-Manga",
      artist: "7116-Manga",
      latestChapter: chapterNumber || 1,
    },
    update: {
      cover: shouldUpdateCover && data.cover ? data.cover : undefined,
      synopsis: data.synopsis && data.synopsis !== "ไม่มีเรื่องย่อ" ? data.synopsis : undefined,
      latestChapter: chapterNumber ? { set: Math.max(chapterNumber, 1) } : undefined,
    },
  });

  // If this chapter has pages/images, save the chapter!
  if (chapterNumber !== null && data.images && data.images.length > 0) {
    await prisma.chapter.upsert({
      where: {
        mangaId_number: {
          mangaId: mangaRecord.id,
          number: chapterNumber,
        },
      },
      create: {
        number: chapterNumber,
        title: chapterTitle,
        pages: JSON.stringify(data.images),
        releaseDate: "วันนี้",
        mangaId: mangaRecord.id,
      },
      update: {
        pages: JSON.stringify(data.images),
        title: chapterTitle,
      },
    });

    // Update manga's latestChapter if this chapter is greater
    if (chapterNumber > mangaRecord.latestChapter) {
      await prisma.manga.update({
        where: { id: mangaRecord.id },
        data: { latestChapter: chapterNumber },
      });
    }
  }

  // If chapters list is provided from series page, update latestChapter on mangaRecord (NEVER create empty chapters with pages: [])
  if (data.chapters && data.chapters.length > 0) {
    let maxFound = mangaRecord.latestChapter || 1;
    for (const ch of data.chapters) {
      const match = ch.title.match(/ตอนที่\s*(\d+(\.\d+)?)/i) || ch.url.match(/ตอนที่-(\d+(\.\d+)?)/i);
      const num = match ? parseFloat(match[1]) : null;
      if (num !== null && num > maxFound) {
        maxFound = num;
      }
    }
    if (maxFound > mangaRecord.latestChapter) {
      await prisma.manga.update({
        where: { id: mangaRecord.id },
        data: { latestChapter: maxFound },
      });
    }
  }

  const updatedManga = await getMangaBySlug(slug);
  return {
    manga: updatedManga || formatManga(mangaRecord),
    chapterNumber: chapterNumber || undefined,
  };
}
