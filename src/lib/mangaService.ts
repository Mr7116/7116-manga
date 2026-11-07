import { cache } from "react";
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
  latestUpdateTimestamp: number;
  chapters: CleanChapter[];
}

export interface CleanChapter {
  id: string;
  number: number;
  title: string;
  releaseDate: string;
  createdAt?: string;
  pages: string[];
}

const THAI_MONTH_INDEX: Record<string, number> = {
  "มกราคม": 0, "ม.ค.": 0, "ม.ค": 0, "january": 0, "jan": 0,
  "กุมภาพันธ์": 1, "ก.พ.": 1, "ก.พ": 1, "february": 1, "feb": 1,
  "มีนาคม": 2, "มี.ค.": 2, "มี.ค": 2, "march": 2, "mar": 2,
  "เมษายน": 3, "เม.ย.": 3, "เม.ย": 3, "april": 3, "apr": 3,
  "พฤษภาคม": 4, "พ.ค.": 4, "พ.ค": 4, "may": 4,
  "มิถุนายน": 5, "มิ.ย.": 5, "มิ.ย": 5, "june": 5, "jun": 5,
  "กรกฎาคม": 6, "ก.ค.": 6, "ก.ค": 6, "july": 6, "jul": 6,
  "สิงหาคม": 7, "ส.ค.": 7, "ส.ค": 7, "august": 7, "aug": 7,
  "กันยายน": 8, "ก.ย.": 8, "ก.ย": 8, "september": 8, "sep": 8,
  "ตุลาคม": 9, "ต.ค.": 9, "ต.ค": 9, "october": 9, "oct": 9,
  "พฤศจิกายน": 10, "พ.ย.": 10, "พ.ย": 10, "november": 10, "nov": 10,
  "ธันวาคม": 11, "ธ.ค.": 11, "ธ.ค": 11, "december": 11, "dec": 11,
};

export function parseThaiDateToTimestamp(text?: string | null): number {
  if (!text || typeof text !== "string") return 0;
  // Clean chapter number prefixes so numbers like "ตอนที่ 337" won't be mistaken for day/year
  const str = text
    .replace(/ตอนที่\s*\d+(\.\d+)?/gi, "")
    .replace(/chapter\s*\d+(\.\d+)?/gi, "")
    .replace(/ch\s*\d+(\.\d+)?/gi, "")
    .trim();

  if (!str) return 0;

  const now = Date.now();
  if (/วันนี้|today/i.test(str)) return now;
  if (/เมื่อวาน|yesterday/i.test(str)) return now - 24 * 60 * 60 * 1000;

  const minMatch = str.match(/(\d+)\s*(?:นาที|min(?:ute)?s?)\s*(?:ที่แล้ว|ago)/i);
  if (minMatch) return now - parseInt(minMatch[1], 10) * 60 * 1000;

  const hrMatch = str.match(/(\d+)\s*(?:ชั่วโมง|ชม\.?|hours?)\s*(?:ที่แล้ว|ago)/i);
  if (hrMatch) return now - parseInt(hrMatch[1], 10) * 60 * 60 * 1000;

  const dayMatch = str.match(/(\d+)\s*(?:วัน|days?)\s*(?:ที่แล้ว|ago)/i);
  if (dayMatch) return now - parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000;

  const monthNames = Object.keys(THAI_MONTH_INDEX).sort((a, b) => b.length - a.length).join("|");

  // Format 1: Full Month Day, Year e.g. "พฤศจิกายน 5, 2026"
  const m1 = str.match(new RegExp(`(${monthNames})\\s*(\\d{1,2})\\s*,?\\s*(\\d{4})`, "i"));
  if (m1) {
    const month = THAI_MONTH_INDEX[m1[1].toLowerCase()];
    const day = parseInt(m1[2], 10);
    let year = parseInt(m1[3], 10);
    if (year > 2400) year -= 543;
    return new Date(year, month, day, 12, 0, 0).getTime();
  }

  // Format 2: Day Month Year e.g. "5 พฤศจิกายน 2026" or "10 พฤศจิกายน 2025"
  const m2 = str.match(new RegExp(`(\\d{1,2})\\s*(${monthNames})\\s*,?\\s*(\\d{4})`, "i"));
  if (m2) {
    const day = parseInt(m2[1], 10);
    const month = THAI_MONTH_INDEX[m2[2].toLowerCase()];
    let year = parseInt(m2[3], 10);
    if (year > 2400) year -= 543;
    return new Date(year, month, day, 12, 0, 0).getTime();
  }

  // Format 3: Short date without year e.g. "6 พ.ย." or "29 ต.ค." -> defaults to current year (2026)
  const m3 = str.match(new RegExp(`^(\\d{1,2})\\s*(${monthNames})$`, "i"));
  if (m3) {
    const day = parseInt(m3[1], 10);
    const month = THAI_MONTH_INDEX[m3[2].toLowerCase()];
    return new Date(2026, month, day, 12, 0, 0).getTime();
  }

  return 0;
}

// Convert Prisma model to UI CleanManga
function formatManga(m: any): CleanManga {
  const chapters = (m.chapters || []).map((c: any) => ({
    id: c.id,
    number: c.number,
    title: c.title,
    releaseDate: c.releaseDate || "วันนี้",
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : undefined,
    pages: c.pages ? (typeof c.pages === "string" ? JSON.parse(c.pages || "[]") : c.pages) : [],
  }));

  // True latest chapter release date for sorting:
  // Sort by the actual published date of the latest chapter (วันที่ล่าสุดของตอนล่าสุด)
  let latestUpdateTimestamp = 0;
  for (const c of chapters) {
    const tsTitle = parseThaiDateToTimestamp(c.title);
    const tsRel = parseThaiDateToTimestamp(c.releaseDate);
    const tsCreated = c.createdAt ? new Date(c.createdAt).getTime() : 0;
    const effectiveTs = tsTitle || tsRel || tsCreated;
    if (effectiveTs > latestUpdateTimestamp) {
      latestUpdateTimestamp = effectiveTs;
    }
  }

  if (latestUpdateTimestamp === 0) {
    latestUpdateTimestamp = m.updatedAt ? new Date(m.updatedAt).getTime() : 0;
  }

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
    latestChapter: m.latestChapter || (chapters[0]?.number ?? 1),
    updatedAt: "อัปเดตล่าสุด",
    latestUpdateTimestamp,
    chapters,
  };
}

// Helper to normalize manga title for cross-source matching (e.g. "The Infinite Mage" vs "Infinite Mage")
export function normalizeMangaTitle(t: string): string {
  if (!t) return "";
  return t
    .toLowerCase()
    .replace(/\s*\|\s*.*$/, "")
    .replace(/^อ่านมังงะ\s*(เรื่อง)?\s*/i, "")
    .replace(/^มังงะ\s*(เรื่อง)?\s*/i, "")
    .replace(/\s+แปลไทย.*$/i, "")
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s*\((remake|color|thai)\)/gi, "")
    .replace(/ตอนที่\s*\d+.*$/i, "")
    .replace(/[^\w\u0E00-\u0E7F]/g, "")
    .trim();
}

// Find existing manga by matching candidate slug or normalized titles
export async function findMatchingMangaSlug(candidateSlug: string, title?: string): Promise<string> {
  if (candidateSlug) {
    const direct = await prisma.manga.findUnique({
      where: { slug: candidateSlug },
      select: { slug: true },
    });
    if (direct) return direct.slug;
  }

  if (!title) return candidateSlug;

  const nTitle = normalizeMangaTitle(title);
  if (!nTitle) return candidateSlug;

  const all = await prisma.manga.findMany({
    select: { slug: true, title: true, thaiTitle: true },
  });

  for (const m of all) {
    const n1 = normalizeMangaTitle(m.title);
    const n2 = normalizeMangaTitle(m.thaiTitle || "");
    if (
      (n1 && (nTitle === n1 || nTitle.includes(n1) || n1.includes(nTitle))) ||
      (n2 && (nTitle.includes(n2) || n2.includes(nTitle)))
    ) {
      return m.slug;
    }
  }

  return candidateSlug;
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
        select: {
          id: true,
          number: true,
          title: true,
          releaseDate: true,
          createdAt: true,
        },
        orderBy: { number: "desc" },
        take: 3, // latest chapters for card display
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  let formatted = mangas.map(formatManga);

  // Whichever manga has the newest chapter date sits at the top-left (index 0)
  formatted.sort((a, b) => {
    const diff = (b.latestUpdateTimestamp || 0) - (a.latestUpdateTimestamp || 0);
    if (diff !== 0) return diff;
    return (b.latestChapter || 0) - (a.latestChapter || 0);
  });

  if (filter?.genre && filter.genre !== "Genre All" && filter.genre !== "ทั้งหมด") {
    formatted = formatted.filter((m) => m.genres.includes(filter.genre!));
  }

  return formatted;
}

export const getMangaBySlug = cache(async (slug: string): Promise<CleanManga | null> => {
  const manga = await prisma.manga.findUnique({
    where: { slug },
    include: {
      chapters: {
        select: {
          id: true,
          number: true,
          title: true,
          releaseDate: true,
        },
        orderBy: { number: "desc" },
      },
    },
  });

  if (!manga) return null;
  return formatManga(manga);
});

export const getChapter = cache(async (
  slug: string,
  chapterNumber: number
): Promise<{ manga: CleanManga; chapter: CleanChapter } | null> => {
  // Query manga navigation and current chapter concurrently in parallel
  const [manga, currentChapterRecord] = await Promise.all([
    getMangaBySlug(slug),
    prisma.chapter.findFirst({
      where: {
        manga: { slug },
        number: chapterNumber,
      },
      select: {
        id: true,
        number: true,
        title: true,
        releaseDate: true,
        pages: true,
      },
    }),
  ]);

  if (!manga || !currentChapterRecord) return null;

  const currentChapter: CleanChapter = {
    id: currentChapterRecord.id,
    number: currentChapterRecord.number,
    title: currentChapterRecord.title,
    releaseDate: currentChapterRecord.releaseDate,
    pages: typeof currentChapterRecord.pages === "string"
      ? JSON.parse(currentChapterRecord.pages || "[]")
      : (currentChapterRecord.pages || []),
  };

  return { manga, chapter: currentChapter };
});

export const getRelatedMangas = cache(async (excludeSlug: string, limit = 5): Promise<CleanManga[]> => {
  const mangas = await prisma.manga.findMany({
    where: { slug: { not: excludeSlug } },
    take: limit,
    orderBy: { updatedAt: "desc" },
    include: {
      chapters: {
        select: {
          id: true,
          number: true,
          title: true,
          releaseDate: true,
        },
        orderBy: { number: "desc" },
        take: 3,
      },
    },
  });
  return mangas.map(formatManga);
});

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

  // Cross-source Smart Matching: if candidate slug doesn't exist, check if an existing manga matches by title
  slug = await findMatchingMangaSlug(slug, data.title);

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

    // Update manga's latestChapter and updatedAt when a chapter is saved
    await prisma.manga.update({
      where: { id: mangaRecord.id },
      data: {
        latestChapter: Math.max(chapterNumber, mangaRecord.latestChapter),
        updatedAt: new Date(),
      },
    });
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
