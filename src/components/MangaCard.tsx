"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { Manga } from "@/data/manga";
import { useReadChapters } from "@/lib/readingHistory";

interface MangaCardProps {
  manga: Manga;
  isFirst?: boolean;
}

export default function MangaCard({ manga, isFirst }: MangaCardProps) {
  const readChapters = useReadChapters(manga.slug) as number[];

  // Determine badge color by type
  const typeBadgeColors = {
    MANHWA: "bg-[#d44837] text-white",
    MANHUA: "bg-[#0d9488] text-white",
    MANGA: "bg-[#2563eb] text-white",
  };

  // Render 5 stars based on rating (out of 10 -> divide by 2)
  const starCount = Math.round(manga.rating / 2);

  // Extract up to 2 latest chapters for pill display (as shown in Image 3)
  const latestTwoChapters = (manga.chapters && manga.chapters.length > 0)
    ? manga.chapters.slice(0, 2)
    : [
        { id: "latest", number: manga.latestChapter, releaseDate: "อัปเดต" },
        ...(manga.latestChapter > 1
          ? [{ id: "prev", number: manga.latestChapter - 1, releaseDate: "ล่าสุด" }]
          : []),
      ];

  return (
    <div className="group flex flex-col w-full">
      {/* Cover Image with Badges */}
      <Link
        href={`/manga/${manga.slug}`}
        className="relative aspect-[3/4.2] w-full overflow-hidden rounded-md bg-[#191b1f] shadow-md transition-transform duration-200 group-hover:scale-[1.02]"
      >
        <img
          src={manga.cover}
          alt={manga.title}
          className="h-full w-full object-cover transition-opacity duration-300 group-hover:opacity-95"
          loading="lazy"
        />

        {/* TOP-RIGHT BADGE: Type (MANHWA / MANHUA / MANGA) */}
        <div className="absolute top-1.5 right-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider shadow ${
              typeBadgeColors[manga.type] || "bg-[#d44837] text-white"
            }`}
          >
            {manga.type}
          </span>
        </div>

        {/* BOTTOM-LEFT BADGE: COLOR */}
        {manga.isColor && (
          <div className="absolute bottom-1.5 left-1.5">
            <span className="flex items-center gap-0.5 rounded bg-[#facc15] px-1 py-0.5 text-[9px] font-black text-black shadow">
              <span className="text-[8px]">🎨</span> COLOR
            </span>
          </div>
        )}
      </Link>

      {/* Info below cover */}
      <div className="mt-2 flex flex-col space-y-1.5">
        {/* Title */}
        <Link href={`/manga/${manga.slug}`}>
          <h3
            className={`line-clamp-2 text-xs font-bold leading-tight transition-colors ${
              isFirst
                ? "text-[#4ade80] hover:text-white"
                : "text-zinc-100 hover:text-[#46e39a]"
            }`}
            title={manga.title}
          >
            {manga.title}
          </h3>
        </Link>

        {/* CHAPTER PILLS (EXACT LOOK OF IMAGE 3) */}
        <div className="space-y-1 pt-0.5">
          {latestTwoChapters.map((ch) => {
            const isRead = readChapters.includes(ch.number);
            return (
              <Link
                key={ch.id || String(ch.number)}
                href={`/manga/${manga.slug}/${ch.number}`}
                className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#202228] hover:bg-[#282a32] text-[11px] transition-colors border border-black/20"
              >
                <span
                  className={`font-bold transition-colors ${
                    isRead ? "text-[#46e39a]" : "text-zinc-200 hover:text-white"
                  }`}
                >
                  ตอนที่ {ch.number}
                </span>
                <span className="text-[10px] text-zinc-400">
                  {ch.releaseDate || "อัปเดต"}
                </span>
              </Link>
            );
          })}
        </div>

        {/* 5-Star Rating + Score (hidden until a real rating exists) */}
        {manga.rating > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
          <div className="flex items-center text-[#f59e0b]">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-2.5 w-2.5 ${
                  star <= starCount
                    ? "fill-[#f59e0b] text-[#f59e0b]"
                    : "fill-zinc-700 text-zinc-700"
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] font-bold text-zinc-400">
            {manga.rating.toFixed(1)}
          </span>
        </div>
        )}
      </div>
    </div>
  );
}
