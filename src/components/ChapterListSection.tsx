"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ArrowUpDown, BookOpen, Clock, ChevronRight, CheckCircle2 } from "lucide-react";
import { Manga } from "@/data/manga";
import { useReadChapters } from "@/lib/readingHistory";

interface ChapterListSectionProps {
  manga: Manga;
}

export default function ChapterListSection({ manga }: ChapterListSectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDesc, setIsDesc] = useState(true);
  const readChapters = useReadChapters(manga.slug) as number[];

  const filteredChapters = manga.chapters
    .filter(
      (ch) =>
        ch.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ch.number.toString().includes(searchTerm)
    )
    .sort((a, b) => (isDesc ? b.number - a.number : a.number - b.number));

  return (
    <div className="space-y-3">
      {/* Search and Sort Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="ค้นหาเลขตอน หรือชื่อตอน..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-zinc-700/80 bg-[#16181d] px-3 py-2 pl-9 text-xs text-zinc-200 placeholder-zinc-500 focus:border-[#46e39a] focus:outline-none"
          />
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
        </div>

        <button
          onClick={() => setIsDesc(!isDesc)}
          className="flex items-center justify-center gap-1.5 rounded-md border border-zinc-700/80 bg-[#2b2d33] px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-[#383a42] hover:text-white transition-colors"
        >
          <ArrowUpDown className="h-3 w-3 text-[#46e39a]" />
          <span>{isDesc ? "เรียง: ตอนล่าสุดก่อน" : "เรียง: ตอนแรกก่อน"}</span>
        </button>
      </div>

      {/* Chapters Grid / List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[460px] overflow-y-auto pr-1">
        {filteredChapters.map((ch) => {
          const isRead = readChapters.includes(ch.number);

          return (
            <Link
              key={ch.id}
              href={`/manga/${manga.slug}/${ch.number}`}
              className={`group flex items-center justify-between rounded-md border p-2.5 transition-all relative ${
                isRead
                  ? "border-orange-500/40 bg-[#1c1615] border-r-4 border-r-[#f97316] hover:bg-[#251b18] hover:border-orange-500/70 shadow-sm"
                  : "border-zinc-800 bg-[#16181d]/80 hover:border-[#46e39a]/60 hover:bg-[#202228]"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors ${
                    isRead
                      ? "bg-orange-500/20 text-[#f97316]"
                      : "bg-[#2b2d33] text-zinc-400 group-hover:bg-[#46e39a]/20 group-hover:text-[#46e39a]"
                  }`}
                >
                  {isRead ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <BookOpen className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <h4
                      className={`truncate text-xs font-bold transition-colors ${
                        isRead
                          ? "text-[#f97316] group-hover:text-orange-400"
                          : "text-zinc-200 group-hover:text-[#46e39a]"
                      }`}
                    >
                      {ch.title}
                    </h4>
                    {isRead && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">
                        อ่านแล้ว
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {ch.releaseDate}
                    </span>
                    {ch.pages.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{ch.pages.length} หน้า</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <ChevronRight
                  className={`h-3.5 w-3.5 group-hover:translate-x-0.5 transition-all shrink-0 ${
                    isRead ? "text-orange-400" : "text-zinc-600 group-hover:text-[#46e39a]"
                  }`}
                />
              </div>
            </Link>
          );
        })}

        {filteredChapters.length === 0 && (
          <div className="col-span-full py-10 text-center text-xs text-zinc-500">
            ไม่พบตอนที่ค้นหา
          </div>
        )}
      </div>
    </div>
  );
}
