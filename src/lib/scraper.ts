import * as cheerio from "cheerio";
import { safeFetch } from "./safeFetch";

/**
 * Single source of truth for scraping manga sites
 * (MangaReader/"ts_reader" themes such as Go-Manga, plus common Madara selectors).
 * Used by both /api/scrape and the background sync engine.
 */

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
};

export const FETCH_TIMEOUT_MS = 10_000;

export type MangaType = "MANHWA" | "MANHUA" | "MANGA";
export type MangaStatus = "Ongoing" | "Completed";

export interface ScrapedChapterLink {
  number: number | null;
  title: string;
  url: string;
  releaseDate?: string;
}

export interface ScrapedPage {
  url: string;
  rawTitle: string;
  title: string;
  cover: string;
  synopsis: string;
  images: string[];
  /** Chapter number of this page when it is a chapter (reader) page, else null */
  chapterNumber: number | null;
  chapters: ScrapedChapterLink[];
  nextUrl: string;
  prevUrl: string;
  genres: string[];
  type?: MangaType;
  status?: MangaStatus;
  author?: string;
  artist?: string;
}

/** Decode any pre-existing %XX then re-encode, so Thai URLs are never double-encoded. */
export function normalizeThaiUrl(inputUrl: string): string {
  const trimmed = inputUrl.trim();
  try {
    return encodeURI(decodeURI(trimmed));
  } catch {
    return encodeURI(trimmed);
  }
}

/** Strip site suffixes / "อ่านมังงะ" prefixes / chapter numbers from a page title. */
export function cleanSeriesTitle(raw: string): string {
  return (raw || "")
    .replace(/\s*[|–-]\s*Go-Manga.*$/i, "")
    .replace(/\s*\|\s*เว็บอ่าน.*$/i, "")
    .replace(/\s*\|\s*.*$/, "")
    .replace(/ตอนที่\s*\d+.*$/i, "")
    .replace(/^อ่านมังงะ\s*(?:เรื่อง)?\s*/i, "")
    .replace(/^มังงะ\s*(?:เรื่อง)?\s*/i, "")
    .replace(/\s+แปลไทย.*$/i, "")
    .trim();
}

/** Find a chapter number in link text first, then in the (decoded) URL. */
export function parseChapterNumber(text?: string | null, url?: string | null): number | null {
  const textPatterns = [
    /ตอนที่\s*(\d+(?:\.\d+)?)/i,
    /chapter\s*(\d+(?:\.\d+)?)/i,
    /\bch\.?\s*(\d+(?:\.\d+)?)/i,
    /\bep\.?\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const re of textPatterns) {
    const m = text?.match(re);
    if (m) return parseFloat(m[1]);
  }

  if (url) {
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {}
    const urlPatterns = [
      /ตอนที่-(\d+(?:\.\d+)?)/i,
      /chapter-(\d+(?:\.\d+)?)/i,
      /[-/]ch-(\d+(?:\.\d+)?)/i,
      /[-/]ep-(\d+(?:\.\d+)?)/i,
    ];
    for (const re of urlPatterns) {
      const m = decoded.match(re);
      if (m) return parseFloat(m[1]);
    }
  }
  return null;
}

export function isChapterUrl(url: string): boolean {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {}
  return /ตอนที่|chapter|[-/]ch-\d|[-/]ep-\d/i.test(decoded);
}

export async function fetchHtml(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const res = await safeFetch(normalizeThaiUrl(url), {
    headers: DEFAULT_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ไม่สามารถเข้าถึง URL ได้ (HTTP Status: ${res.status})`);
  }
  // Decode explicitly as UTF-8 to avoid charset issues with Thai pages
  return new TextDecoder("utf-8").decode(await res.arrayBuffer());
}

function absolutize(src: string, base: string): string | null {
  try {
    return new URL(src.trim(), base).toString();
  } catch {
    return null;
  }
}

function extractImages($: cheerio.CheerioAPI, html: string, pageUrl: string) {
  let images: string[] = [];
  let nextUrl = "";
  let prevUrl = "";

  // A: ts_reader.run({...}) (MangaReader theme)
  const ts = html.match(/ts_reader\.run\(([\s\S]*?)\);/);
  if (ts?.[1]) {
    try {
      const data = JSON.parse(ts[1]);
      for (const src of data.sources ?? []) {
        if (Array.isArray(src.images) && src.images.length > 0) {
          images = src.images;
          break;
        }
      }
      nextUrl = data.nextUrl || "";
      prevUrl = data.prevUrl || "";
    } catch {}
  }

  // B: generic "images": [...] array in inline scripts
  if (images.length === 0) {
    const arr = html.match(/"images":\s*(\[[^\]]+\])/);
    if (arr?.[1]) {
      try {
        const parsed = JSON.parse(arr[1]);
        if (Array.isArray(parsed)) images = parsed.filter((x) => typeof x === "string");
      } catch {}
    }
  }

  // C: DOM images
  if (images.length === 0) {
    $(
      "#readerarea img, .reading-content img, .page-break img, .chapter-image img, .container-chapter-reader img"
    ).each((_, el) => {
      const raw =
        $(el).attr("data-src") ||
        $(el).attr("data-lazy-src") ||
        $(el).attr("src") ||
        $(el).attr("data-original");
      if (!raw) return;
      const abs = absolutize(raw, pageUrl);
      if (
        abs &&
        !/\.gif($|\?)/i.test(abs) &&
        !abs.includes("logo") &&
        !abs.includes("banner") &&
        !abs.includes("readerarea.svg")
      ) {
        images.push(abs);
      }
    });
  }

  return { images: Array.from(new Set(images)), nextUrl, prevUrl };
}

function extractChapters($: cheerio.CheerioAPI, pageUrl: string): ScrapedChapterLink[] {
  const chapters: ScrapedChapterLink[] = [];
  const seenNumbers = new Set<number>();
  const seenUrls = new Set<string>();

  const add = (href: string | undefined, text: string, releaseDate?: string) => {
    if (!href || href.startsWith("#")) return;
    const url = absolutize(href, pageUrl);
    if (!url || seenUrls.has(url)) return;
    const looksLikeChapter = isChapterUrl(url) || /ตอนที่|ตอน|chapter/i.test(text);
    if (!looksLikeChapter) return;

    const number = parseChapterNumber(text, url);
    if (number !== null) {
      if (seenNumbers.has(number)) return;
      seenNumbers.add(number);
    }
    seenUrls.add(url);
    const cleanText = text.replace(/\s+/g, " ").trim();
    chapters.push({
      number,
      title: number !== null ? `ตอนที่ ${number}` : cleanText.slice(0, 120) || "ตอน",
      url,
      releaseDate: releaseDate || undefined,
    });
  };

  // Series page chapter lists
  $(".eplister li, .clplist li, ul.chapters li, .chapter-list li, li.wp-manga-chapter").each((_, el) => {
    const $el = $(el);
    const link = $el.find("a").first();
    const text = $el.find(".chapternum").text().trim() || link.text().trim() || $el.text().trim();
    const date = $el.find(".chapterdate, .chapter-release-date").first().text().trim();
    add(link.attr("href"), text, date);
  });

  // Chapter page dropdown
  $("select#chapter option, select.chapter-select option").each((_, el) => {
    add($(el).attr("value"), $(el).text().trim());
  });

  // Last resort: any chapter-looking link inside the content area
  if (chapters.length === 0) {
    $(".entry-content a").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0 && text.length < 120) add($(el).attr("href"), text);
    });
  }

  return chapters;
}

function extractInfo($: cheerio.CheerioAPI) {
  const pairs: { label: string; value: string }[] = [];

  // MangaReader theme: <div class="imptdt">Status <i>Ongoing</i></div>
  $(".imptdt").each((_, el) => {
    const $el = $(el);
    const value = $el.find("i, a").first().text().trim();
    const label = $el.text().replace(value, "").trim();
    if (value) pairs.push({ label, value });
  });
  // Madara theme
  $(".post-content_item").each((_, el) => {
    const label = $(el).find(".summary-heading").text().trim();
    const value = $(el).find(".summary-content").text().trim();
    if (label && value) pairs.push({ label, value });
  });
  // Generic "fmed" blocks: <div class="fmed"><b>Author</b><span>xxx</span></div>
  $(".fmed").each((_, el) => {
    const label = $(el).find("b").text().trim();
    const value = $(el).find("span").text().trim();
    if (label && value) pairs.push({ label, value });
  });

  let type: MangaType | undefined;
  let status: MangaStatus | undefined;
  let author: string | undefined;
  let artist: string | undefined;

  for (const { label, value } of pairs) {
    const l = label.toLowerCase();
    const v = value.toLowerCase();
    if (!status && /status|สถานะ/.test(l)) {
      if (/complet|จบแล้ว|finished|end/.test(v)) status = "Completed";
      else if (/ongoing|ยังไม่จบ|กำลัง|ต่อเนื่อง/.test(v)) status = "Ongoing";
    } else if (!type && /type|ประเภท/.test(l)) {
      if (/manhwa|เกาหลี/.test(v)) type = "MANHWA";
      else if (/manhua|จีน/.test(v)) type = "MANHUA";
      else if (/manga|ญี่ปุ่น/.test(v)) type = "MANGA";
    } else if (!author && /author|ผู้แต่ง|ผู้เขียน/.test(l) && value !== "-") {
      author = value.slice(0, 120);
    } else if (!artist && /artist|นักวาด/.test(l) && value !== "-") {
      artist = value.slice(0, 120);
    }
  }

  const genres = Array.from(
    new Set(
      $(".mgen a, .seriestucontent .genres a, .genres-content a, .wd-full .genres a")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((g) => g && g.length < 40)
    )
  );

  return { type, status, author, artist, genres };
}

export function parsePage(html: string, pageUrl: string): ScrapedPage {
  const $ = cheerio.load(html);

  const rawTitle =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    "";

  // Cover: prefer the real series poster over chapter page 1
  let cover = "";
  const t = html.match(/"t":\s*"([^"]+\.(?:jpg|jpeg|png|webp))"/i);
  if (t?.[1]) cover = t[1].replace(/\\\//g, "/");
  if (!cover) {
    cover =
      $(
        '.thumb img, .summary_image img, .cover img, .bigcontent img, .series-cover img, img[itemprop="image"]'
      )
        .first()
        .attr("src") || "";
  }
  if (!cover) {
    cover =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      "";
  }
  if (cover) cover = absolutize(cover, pageUrl) || "";

  const synopsis = (
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    $(".entry-content p, .description p, .summary__content, .synopsis").first().text() ||
    ""
  ).trim();

  const { images, nextUrl, prevUrl } = extractImages($, html, pageUrl);
  const chapters = extractChapters($, pageUrl);
  const info = extractInfo($);

  if (!cover && images.length > 0) cover = images[0];

  return {
    url: pageUrl,
    rawTitle,
    title: cleanSeriesTitle(rawTitle) || rawTitle,
    cover,
    synopsis,
    images,
    chapterNumber: images.length > 0 ? parseChapterNumber(rawTitle, pageUrl) : null,
    chapters,
    nextUrl,
    prevUrl,
    ...info,
  };
}

export async function scrapePage(url: string): Promise<ScrapedPage> {
  const safeUrl = normalizeThaiUrl(url);
  const html = await fetchHtml(safeUrl);
  return parsePage(html, safeUrl);
}

export async function scrapeChapterImages(chapterUrl: string): Promise<string[]> {
  try {
    return (await scrapePage(chapterUrl)).images;
  } catch {
    return [];
  }
}
