import { cache } from "react";
import { prisma } from "./prisma";
import { seedDatabaseIfEmpty } from "./seed";
import { slugify, slugFromUrl } from "./slug";
import { cleanSeriesTitle, isChapterUrl, parseChapterNumber } from "./scraper";

export { slugify };

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

  // Format 3: Short date without year e.g. "6 พ.ย." or "29 ต.ค." -> assume the most recent such date
  // (current year, or last year if that would be in the future — e.g. "29 ธ.ค." read in January)
  const m3 = str.match(new RegExp(`^(\\d{1,2})\\s*(${monthNames})$`, "i"));
  if (m3) {
    const day = parseInt(m3[1], 10);
    const month = THAI_MONTH_INDEX[m3[2].toLowerCase()];
    const year = new Date(now).getFullYear();
    let ts = new Date(year, month, day, 12, 0, 0).getTime();
    if (ts > now + 24 * 60 * 60 * 1000) {
      ts = new Date(year - 1, month, day, 12, 0, 0).getTime();
    }
    return ts;
  }

  return 0;
}

const DATE_IN_TITLE_RE = (() => {
  const months = Object.keys(THAI_MONTH_INDEX)
    .sort((a, b) => b.length - a.length)
    .map((m) => m.replace(/\./g, "\\."))
    .join("|");
  return new RegExp(
    `\\s*(?:(?:${months})\\s*\\d{1,2}\\s*,?\\s*\\d{4}|\\d{1,2}\\s*(?:${months})\\s*,?\\s*\\d{4})\\s*$`,
    "i"
  );
})();

function shortThaiDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

/**
 * Older imports stored the source link text as the title ("ตอนที่ 172 มิถุนายน 4, 2026") and
 * a fixed "วันนี้" as release date. Split the date out of the title and never show a stale "วันนี้".
 */
function cleanChapterDisplay(c: any): { title: string; releaseDate: string } {
  let title: string = c.title || `ตอนที่ ${c.number}`;
  let releaseDate: string = c.releaseDate || "";
  const dateMatch = title.match(DATE_IN_TITLE_RE);
  if (dateMatch) {
    title = title.slice(0, dateMatch.index).trim();
    if (!releaseDate || releaseDate === "วันนี้") releaseDate = dateMatch[0].trim();
  }
  if (!releaseDate || releaseDate === "วันนี้") {
    const created = c.createdAt ? new Date(c.createdAt) : null;
    releaseDate =
      created && Date.now() - created.getTime() > 24 * 60 * 60 * 1000
        ? shortThaiDate(created)
        : "วันนี้";
  }
  return { title, releaseDate };
}

// Convert Prisma model to UI CleanManga
function formatManga(m: any): CleanManga {
  const chapters = (m.chapters || []).map((c: any) => ({
    id: c.id,
    number: c.number,
    ...cleanChapterDisplay(c),
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
    genres: m.genres ? m.genres.split(",").map((g: string) => g.trim()).filter(Boolean) : [],
    // 0 / "0" means "no real data yet" — the UI hides these values
    rating: m.rating ?? 0,
    ratingCount: m.ratingCount ?? 0,
    views: m.views || "0",
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

// Find existing manga by candidate slug, or by an EXACT normalized-title match.
// (Substring matching was removed: short titles like "Mage" used to swallow unrelated series.)
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
  // Very short normalized titles are too ambiguous to merge on
  if (!nTitle || nTitle.length < 4) return candidateSlug;

  const all = await prisma.manga.findMany({
    select: { slug: true, title: true, thaiTitle: true },
  });

  for (const m of all) {
    if (
      normalizeMangaTitle(m.title) === nTitle ||
      (m.thaiTitle && normalizeMangaTitle(m.thaiTitle) === nTitle)
    ) {
      return m.slug;
    }
  }

  return candidateSlug;
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
    const q = filter.search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { thaiTitle: { contains: q, mode: "insensitive" } },
      { genres: { contains: q, mode: "insensitive" } },
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
          createdAt: true,
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
          createdAt: true,
        },
        orderBy: { number: "desc" },
        take: 3,
      },
    },
  });
  return mangas.map(formatManga);
});

const PLACEHOLDER_COVER = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600";

/**
 * Field values for a brand-new Manga row. No invented ratings / views:
 * rating 0 and views "0" mean "unknown" and are hidden by the UI.
 */
export function newMangaDefaults(meta: {
  genres?: string[];
  type?: string;
  status?: string;
  author?: string;
  artist?: string;
}) {
  return {
    status: meta.status === "Completed" ? "Completed" : "Ongoing",
    type: meta.type === "MANHUA" || meta.type === "MANGA" ? meta.type : "MANHWA",
    isColor: meta.type !== "MANGA",
    genres: (meta.genres ?? []).join(","),
    rating: 0,
    ratingCount: 0,
    views: "0",
    author: meta.author || "Unknown",
    artist: meta.artist || meta.author || "Unknown",
  };
}

/** Metadata update for an existing Manga: only fill values we actually scraped. */
export function scrapedMetaUpdate(meta: {
  genres?: string[];
  type?: string;
  status?: string;
  author?: string;
  artist?: string;
}) {
  return {
    genres: meta.genres && meta.genres.length > 0 ? meta.genres.join(",") : undefined,
    type: meta.type || undefined,
    status: meta.status || undefined,
    author: meta.author || undefined,
    artist: meta.artist || undefined,
  };
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
  chapters?: { title: string; url: string; number?: number | null }[];
  chapterNumber?: number;
  chapterTitle?: string;
  genres?: string[];
  type?: string;
  status?: string;
  author?: string;
  artist?: string;
}): Promise<{ manga: CleanManga; chapterNumber?: number }> {
  await seedDatabaseIfEmpty();

  // Slug: explicit > derived from URL > derived from title
  let slug = data.slug || slugFromUrl(data.seriesUrl || data.url);
  if (!slug) slug = slugify(cleanSeriesTitle(data.title));

  // Cross-source matching (exact normalized title) against existing manga
  slug = await findMatchingMangaSlug(slug, data.title);

  // Chapter number: explicit > URL > title
  let chapterNumber: number | null =
    typeof data.chapterNumber === "number" ? data.chapterNumber : null;
  if (chapterNumber === null && isChapterUrl(data.url)) {
    chapterNumber = parseChapterNumber(null, data.url);
  }
  if (chapterNumber === null) {
    chapterNumber = parseChapterNumber(data.title.match(/ตอนที่\s*\d+(?:\.\d+)?/i)?.[0] ?? null, null);
  }
  const chapterTitle = data.chapterTitle || `ตอนที่ ${chapterNumber ?? 1}`;

  const seriesTitle = cleanSeriesTitle(data.title) || data.title;

  // Don't let a chapter page overwrite the real series poster
  const existingManga = await prisma.manga.findUnique({ where: { slug } });
  const shouldUpdateCover = !existingManga?.cover || !isChapterUrl(data.url);

  const meta = {
    genres: data.genres,
    type: data.type,
    status: data.status,
    author: data.author,
    artist: data.artist,
  };

  const mangaRecord = await prisma.manga.upsert({
    where: { slug },
    create: {
      slug,
      title: seriesTitle,
      thaiTitle: seriesTitle,
      cover: data.cover || PLACEHOLDER_COVER,
      synopsis: data.synopsis || null,
      latestChapter: chapterNumber || 1,
      ...newMangaDefaults(meta),
    },
    update: {
      cover: shouldUpdateCover && data.cover ? data.cover : undefined,
      synopsis: data.synopsis && data.synopsis !== "ไม่มีเรื่องย่อ" ? data.synopsis : undefined,
      ...scrapedMetaUpdate(meta),
    },
  });

  // Save the chapter when this payload carries page images
  if (chapterNumber !== null && data.images && data.images.length > 0) {
    await prisma.chapter.upsert({
      where: {
        mangaId_number: { mangaId: mangaRecord.id, number: chapterNumber },
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

    await prisma.manga.update({
      where: { id: mangaRecord.id },
      data: {
        latestChapter: Math.max(chapterNumber, mangaRecord.latestChapter),
        updatedAt: new Date(),
      },
    });
  }

  // Series page: bump latestChapter from the chapter list (never create empty chapters)
  if (data.chapters && data.chapters.length > 0) {
    let maxFound = mangaRecord.latestChapter || 1;
    for (const ch of data.chapters) {
      const num = typeof ch.number === "number" ? ch.number : parseChapterNumber(ch.title, ch.url);
      if (num !== null && num > maxFound) maxFound = num;
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
    chapterNumber: chapterNumber ?? undefined,
  };
}
