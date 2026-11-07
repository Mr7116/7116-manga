/**
 * Compare a manga's chapters on the source site with what's in the database.
 *
 *   npm run check:manga -- https://www.up-manga.com/solo-farming-tower/
 *   npm run check:manga -- <url> --refetch 13,139   (clear those chapters' pages so the
 *                                                     next sync downloads them again)
 *
 * Prints: chapters on the web but not in DB, chapters in DB with no pages,
 * gaps in numbering, and (for missing ones) how many images each chapter page has.
 */
import { PrismaClient } from "@prisma/client";
import * as cheerio from "cheerio";

try {
  process.loadEnvFile();
} catch {}

const seriesUrl = process.argv[2];
const refetchIdx = process.argv.indexOf("--refetch");
const refetch = refetchIdx > -1
  ? (process.argv[refetchIdx + 1] || "").split(",").map(Number).filter((n) => !Number.isNaN(n))
  : [];
if (!seriesUrl) {
  console.error("usage: npm run check:manga -- <series url>");
  process.exit(1);
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const norm = (u) => {
  try { return encodeURI(decodeURI(u.trim())); } catch { return encodeURI(u.trim()); }
};
async function get(url) {
  const r = await fetch(norm(url), { headers: { "User-Agent": UA, "Accept-Language": "th-TH,th;q=0.9" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return new TextDecoder("utf-8").decode(await r.arrayBuffer());
}
function textNum(text) {
  for (const re of [/ตอนที่\s*(\d+(?:\.\d+)?)/i, /chapter\s*(\d+(?:\.\d+)?)/i, /\bch\.?\s*(\d+(?:\.\d+)?)/i, /\bep\.?\s*(\d+(?:\.\d+)?)/i]) {
    const m = text?.match(re); if (m) return parseFloat(m[1]);
  }
  return null;
}
function urlNum(url) {
  let d = url; try { d = decodeURIComponent(url); } catch {}
  for (const re of [/ตอนที่-(\d+(?:\.\d+)?)/i, /chapter-(\d+(?:\.\d+)?)/i, /[-/]ch-(\d+(?:\.\d+)?)/i, /[-/]ep-(\d+(?:\.\d+)?)/i]) {
    const m = d.match(re); if (m) return parseFloat(m[1]);
  }
  return null;
}
function imageCount(html) {
  const ts = html.match(/ts_reader\.run\(([\s\S]*?)\);/);
  if (ts) { try { for (const s of JSON.parse(ts[1]).sources ?? []) if (s.images?.length) return s.images.length; } catch {} }
  const $ = cheerio.load(html);
  return $("#readerarea img, .reading-content img, .page-break img").length;
}

const prisma = new PrismaClient();
try {
  // --- web ---
  const $ = cheerio.load(await get(seriesUrl));
  const rows = [];
  $(".eplister li, .clplist li, ul.chapters li, .chapter-list li, li.wp-manga-chapter").each((_, el) => {
    const a = $(el).find("a").first();
    const text = ($(el).find(".chapternum").text() || a.text() || $(el).text()).replace(/\s+/g, " ").trim();
    const href = a.attr("href");
    if (href) rows.push({ text, url: new URL(href, seriesUrl).toString(), tNum: textNum(text), uNum: urlNum(href) });
  });
  // same rule as src/lib/scraper.ts: a duplicated label that disagrees with its URL -> trust the URL
  const labelCounts = new Map();
  for (const r of rows) if (r.tNum !== null) labelCounts.set(r.tNum, (labelCounts.get(r.tNum) ?? 0) + 1);
  for (const r of rows) {
    r.num = r.tNum ?? r.uNum;
    if (r.tNum !== null && r.uNum !== null && r.tNum !== r.uNum && labelCounts.get(r.tNum) > 1) r.num = r.uNum;
  }
  const mislabeled = rows.filter((r) => r.tNum !== null && r.num !== r.tNum);
  const unparsed = rows.filter((r) => r.num === null);
  const byNum = new Map();
  for (const r of rows) if (r.num !== null) byNum.set(r.num, [...(byNum.get(r.num) ?? []), r]);
  const dupes = [...byNum].filter(([, v]) => v.length > 1);

  if (refetch.length > 0) {
    const w = await prisma.watchedManga.findUnique({ where: { url: norm(seriesUrl) } });
    const m = w && (await prisma.manga.findUnique({ where: { slug: w.slug } }));
    if (!m) throw new Error("manga not found in DB");
    const r = await prisma.chapter.updateMany({
      where: { mangaId: m.id, number: { in: refetch } },
      data: { pages: "[]" },
    });
    await prisma.watchedManga.update({ where: { id: w.id }, data: { lastSyncedAt: null } });
    console.log(`🔁 cleared pages of ${r.count} chapter(s): ${refetch.join(", ")} — they will be re-downloaded on the next sync (or press "ซิงค์เรื่องนี้")`);
    process.exit(0);
  }

  // --- db ---
  const watch = await prisma.watchedManga.findUnique({ where: { url: norm(seriesUrl) } });
  const slug = watch?.slug;
  const manga = slug && (await prisma.manga.findUnique({ where: { slug }, include: { chapters: { select: { number: true, pages: true } } } }));
  if (!manga) { console.log("❌ manga not found in DB (watch slug:", slug, ")"); process.exit(0); }
  const dbWithPages = new Set(manga.chapters.filter((c) => { try { return JSON.parse(c.pages).length > 0; } catch { return false; } }).map((c) => c.number));
  const dbEmpty = manga.chapters.filter((c) => !dbWithPages.has(c.number)).map((c) => c.number);

  const webNums = [...byNum.keys()].sort((a, b) => a - b);
  const missing = webNums.filter((n) => !dbWithPages.has(n));
  const max = Math.max(...webNums);
  const gapsOnWeb = [];
  for (let i = 1; i <= max; i++) if (!byNum.has(i)) gapsOnWeb.push(i);

  console.log(`\n${manga.title}  (slug: ${slug})`);
  console.log(`web: ${rows.length} rows, ${webNums.length} numbered chapters, highest ${max}`);
  console.log(`db : ${manga.chapters.length} chapters, ${dbWithPages.size} with pages, latestChapter=${manga.latestChapter}`);
  console.log(`watchlist lastError: ${watch?.lastError ?? "-"}`);
  console.log(`\nnumbers 1..${max} that the SOURCE itself doesn't list: ${gapsOnWeb.join(", ") || "none"}`);
  console.log(`rows on source with no chapter number: ${unparsed.map((r) => `"${r.text}"`).join(", ") || "none"}`);
  console.log(`mislabeled on source (label -> URL): ${mislabeled.map((r) => `"${r.text}" -> ${r.num}  ${decodeURIComponent(r.url)}`).join(", ") || "none"}`);
  console.log(`duplicate numbers on source: ${dupes.map(([n, v]) => `${n} (${v.map((x) => x.text).join(" | ")})`).join(", ") || "none"}`);
  console.log(`DB rows with empty pages: ${dbEmpty.join(", ") || "none"}`);
  console.log(`on source but missing in DB: ${missing.join(", ") || "none"}`);

  for (const n of missing.slice(0, 10)) {
    const r = byNum.get(n)[0];
    try {
      console.log(`  - ตอนที่ ${n}: ${imageCount(await get(r.url))} images  ${r.url}`);
    } catch (e) {
      console.log(`  - ตอนที่ ${n}: ${e.message}`);
    }
  }
} finally {
  await prisma.$disconnect();
}
