// Slug helpers shared by the scraper, sync engine and API routes.

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s฀-๿-]/g, "") // Keep alphanumeric and Thai
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Derive a series slug from a series or chapter URL.
 * e.g. https://site/third-rate-martial-family-ตอนที่-1/ -> "third-rate-martial-family"
 */
export function slugFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    // Skip generic prefixes such as /manga/<slug>/ or /series/<slug>/
    const generic = new Set(["manga", "series", "comic", "comics", "webtoon", "read"]);
    const first = parts.find((p) => !generic.has(p.toLowerCase())) ?? parts[0];
    if (!first) return "";
    const candidate = decodeURIComponent(first).replace(
      /[-_](?:ตอนที่|ตอน|chapter|ch|ep)[-_]?\d+.*$/i,
      ""
    );
    return slugify(candidate);
  } catch {
    return "";
  }
}
