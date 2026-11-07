"use client";

import { useState } from "react";
import MangaCard from "@/components/MangaCard";
import { allGenres } from "@/data/manga";
import { CleanManga } from "@/lib/mangaService";
import { Search, ChevronDown } from "lucide-react";

interface MangaListSectionProps {
  initialMangas: CleanManga[];
}

export default function MangaListSection({ initialMangas }: MangaListSectionProps) {
  const [selectedGenre, setSelectedGenre] = useState("Genre All");
  const [selectedStatus, setSelectedStatus] = useState("Status ทั้งหมด");
  const [selectedType, setSelectedType] = useState("Type ทั้งหมด");
  const [selectedOrder, setSelectedOrder] = useState("Order by Update");
  const [isTextMode, setIsTextMode] = useState(false);

  // Filter manga list in memory
  let filteredManga = initialMangas.filter((manga) => {
    if (selectedGenre !== "Genre All" && !manga.genres.includes(selectedGenre)) {
      return false;
    }
    if (selectedStatus !== "Status ทั้งหมด") {
      if (selectedStatus === "จบแล้ว" && manga.status !== "Completed") return false;
      if (selectedStatus === "ยังไม่จบ" && manga.status !== "Ongoing") return false;
    }
    if (selectedType !== "Type ทั้งหมด" && manga.type !== selectedType) {
      return false;
    }
    return true;
  });

  if (selectedOrder === "Order by Update") {
    filteredManga = [...filteredManga].sort((a, b) => {
      const diff = (b.latestUpdateTimestamp || 0) - (a.latestUpdateTimestamp || 0);
      if (diff !== 0) return diff;
      return (b.latestChapter || 0) - (a.latestChapter || 0);
    });
  } else if (selectedOrder === "Rating") {
    filteredManga = [...filteredManga].sort((a, b) => b.rating - a.rating);
  } else if (selectedOrder === "A-Z") {
    filteredManga = [...filteredManga].sort((a, b) => a.title.localeCompare(b.title));
  }

  return (
    <div className="rounded-xl border border-zinc-800/90 bg-[#1e2025]/95 shadow-2xl backdrop-blur-md p-4 sm:p-6">
      {/* Header Title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-bold text-white tracking-wide">
          Manga Lists
        </h1>
        <span className="text-xs text-[#46e39a] font-semibold">
          ทั้งหมด {filteredManga.length} เรื่อง
        </span>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800/80 pb-5 mb-6">
        {/* Dropdowns + Green Search Button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Genre All ▾ */}
          <div className="relative">
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="appearance-none rounded bg-[#2b2d33] px-3 py-1.5 pr-7 text-xs font-semibold text-zinc-200 border border-zinc-700/60 focus:border-[#46e39a] focus:outline-none cursor-pointer"
            >
              {allGenres.map((g) => (
                <option key={g} value={g}>
                  {g === "Genre All" ? "Genre All" : g}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-zinc-400" />
          </div>

          {/* 2. Status ทั้งหมด ▾ */}
          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="appearance-none rounded bg-[#2b2d33] px-3 py-1.5 pr-7 text-xs font-semibold text-zinc-200 border border-zinc-700/60 focus:border-[#46e39a] focus:outline-none cursor-pointer"
            >
              <option value="Status ทั้งหมด">Status ทั้งหมด</option>
              <option value="ยังไม่จบ">ยังไม่จบ (Ongoing)</option>
              <option value="จบแล้ว">จบแล้ว (Completed)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-zinc-400" />
          </div>

          {/* 3. Type ทั้งหมด ▾ */}
          <div className="relative">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="appearance-none rounded bg-[#2b2d33] px-3 py-1.5 pr-7 text-xs font-semibold text-zinc-200 border border-zinc-700/60 focus:border-[#46e39a] focus:outline-none cursor-pointer"
            >
              <option value="Type ทั้งหมด">Type ทั้งหมด</option>
              <option value="MANHWA">MANHWA (เกาหลี)</option>
              <option value="MANHUA">MANHUA (จีน)</option>
              <option value="MANGA">MANGA (ญี่ปุ่น)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-zinc-400" />
          </div>

          {/* 4. Order by Update ▾ */}
          <div className="relative">
            <select
              value={selectedOrder}
              onChange={(e) => setSelectedOrder(e.target.value)}
              className="appearance-none rounded bg-[#2b2d33] px-3 py-1.5 pr-7 text-xs font-semibold text-zinc-200 border border-zinc-700/60 focus:border-[#46e39a] focus:outline-none cursor-pointer"
            >
              <option value="Order by Update">Order by Update</option>
              <option value="Rating">Order by Rating</option>
              <option value="A-Z">A-Z Title</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-zinc-400" />
          </div>

          {/* Mint Green Search Button */}
          <button
            type="button"
            className="flex items-center gap-1.5 rounded bg-[#46e39a] hover:bg-[#3cd089] px-4 py-1.5 text-xs font-bold text-zinc-950 shadow transition-colors cursor-pointer"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
          </button>
        </div>

        {/* Text Mode Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsTextMode(!isTextMode)}
            className={`rounded px-3 py-1.5 text-xs font-medium border transition-colors ${
              isTextMode
                ? "bg-[#46e39a] text-zinc-950 border-[#46e39a] font-bold"
                : "bg-[#2b2d33] text-zinc-300 border-zinc-700/60 hover:bg-[#383a42] hover:text-white"
            }`}
          >
            Text Mode
          </button>
        </div>
      </div>

      {/* MANGA GRID (5 columns on desktop) */}
      {!isTextMode && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3.5 gap-y-6">
          {filteredManga.map((manga, idx) => (
            <MangaCard key={manga.id} manga={manga as any} isFirst={idx === 0} />
          ))}
        </div>
      )}

      {/* Text Mode Table / List */}
      {isTextMode && (
        <div className="divide-y divide-zinc-800 text-xs">
          {filteredManga.map((manga) => (
            <div key={manga.id} className="py-2.5 flex items-center justify-between hover:bg-zinc-800/40 px-2 rounded">
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 font-mono">#{manga.id.slice(-4)}</span>
                <a href={`/manga/${manga.slug}`} className="font-bold text-white hover:text-[#46e39a]">
                  {manga.title}
                </a>
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                  {manga.type}
                </span>
              </div>
              <div className="flex items-center gap-4 text-zinc-400">
                <span>ตอนที่ {manga.latestChapter}</span>
                <span className="text-[#f59e0b] font-bold">★ {manga.rating}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredManga.length === 0 && (
        <div className="py-20 text-center text-xs text-zinc-400">
          ไม่พบข้อมูลมังงะตามเงื่อนไขที่เลือก
        </div>
      )}
    </div>
  );
}
