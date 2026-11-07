"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Search, ChevronDown, Bookmark, Menu, X, Download, Clock } from "lucide-react";
import { CleanManga } from "@/lib/mangaService";

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDark, setIsDark] = useState(true);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<CleanManga[]>([]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/manga?search=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setSearchResults(data.data);
        }
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <header className="w-full z-50">
      {/* 1. TOP ANNOUNCEMENT BANNER */}
      <div className="w-full bg-[#0a0f16] py-1.5 text-center border-b border-cyan-950/60 shadow-inner">
        <span className="text-xs sm:text-sm font-bold tracking-wide text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">
          อ่านมังงะอ่านการ์ตูนออนไลน์แปลไทย 2026
        </span>
      </div>

      {/* 2. MAIN MINT GREEN NAVBAR */}
      <nav className="w-full bg-[#46e39a] text-zinc-900 shadow-md">
        <div className="mx-auto flex h-14 max-w-[1400px] w-full items-center justify-between px-3 sm:px-6 gap-2 lg:gap-4">
          {/* LEFT: Logo & Main Navigation Links */}
          <div className="flex items-center gap-3 lg:gap-5 shrink-0">
            {/* 7116-MANGA 3D Logo */}
            <Link href="/" className="flex items-center gap-1 group shrink-0">
              <span className="logo-gomanga text-xl sm:text-2xl lg:text-3xl tracking-tight text-white whitespace-nowrap shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] select-none">
                7116-MANGA
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden lg:flex items-center gap-2.5 xl:gap-4 text-xs xl:text-[13px] font-bold text-white whitespace-nowrap shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
              <Link href="/" className="hover:text-emerald-950 transition-colors whitespace-nowrap">
                อ่านมังงะ
              </Link>
              <Link href="/?type=MANHWA" className="hover:text-emerald-950 transition-colors whitespace-nowrap">
                มังงะเกาหลี
              </Link>
              <Link href="/?type=MANHUA" className="hover:text-emerald-950 transition-colors whitespace-nowrap">
                มังงะจีน
              </Link>
              <Link href="/?genre=พระเอกเทพ" className="hover:text-emerald-950 transition-colors whitespace-nowrap">
                พระเอกเทพ
              </Link>

              {/* หมวดหมู่อื่นๆ Dropdown */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                  onBlur={() => setTimeout(() => setIsCategoryOpen(false), 200)}
                  className="flex items-center gap-0.5 hover:text-emerald-950 transition-colors whitespace-nowrap"
                >
                  <span>หมวดหมู่อื่นๆ</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {isCategoryOpen && (
                  <div className="absolute top-8 left-0 w-44 rounded-lg bg-[#22242a] p-2 text-white shadow-xl border border-zinc-700 z-50">
                    {["Action", "Fantasy", "Romance", "Comedy", "Martial Arts", "Supernatural"].map((cat) => (
                      <Link
                        key={cat}
                        href={`/?genre=${cat}`}
                        className="block rounded px-3 py-1.5 text-xs hover:bg-[#46e39a] hover:text-black transition-colors"
                      >
                        {cat}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <Link href="/bookmarks" className="flex items-center gap-1 hover:text-emerald-950 transition-colors whitespace-nowrap">
                Bookmark
              </Link>

              <Link
                href="/import"
                className="flex items-center gap-1 rounded bg-black/20 hover:bg-black/30 px-2 py-1 text-[11px] text-white transition-colors whitespace-nowrap shrink-0"
                title="ดึงข้อมูลจาก URL"
              >
                <Download className="h-3 w-3" /> ดึง URL
              </Link>

              <Link
                href="/watchlist"
                className="flex items-center gap-1 rounded bg-black/30 hover:bg-black/40 px-2.5 py-1 text-[11px] text-white font-bold transition-colors shadow-sm whitespace-nowrap shrink-0"
                title="ระบบติดตามและตั้งเวลาดึงอัตโนมัติ"
              >
                <Clock className="h-3 w-3 text-emerald-300" /> ตั้งเวลาซิงค์
              </Link>
            </div>
          </div>

          {/* RIGHT: DARK? Toggle & Search Input */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Dark Toggle Switch */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-black tracking-wider text-emerald-950/80 uppercase whitespace-nowrap">
                DARK?
              </span>
              <button
                type="button"
                onClick={() => setIsDark(!isDark)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-black/30 transition-colors duration-200 ease-in-out focus:outline-none ${
                  isDark ? "bg-[#182a20]" : "bg-white/80"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out mt-[2px] ${
                    isDark ? "translate-x-4 bg-emerald-400" : "translate-x-0.5 bg-zinc-600"
                  }`}
                />
              </button>
            </div>

            {/* Pill Search Box */}
            <div className="relative shrink">
              <div className="flex items-center rounded-full bg-[#111317] border border-black/30 px-3 py-1.5 shadow-inner w-36 sm:w-44 lg:w-48 xl:w-60">
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchDropdownOpen(true);
                  }}
                  onFocus={() => setIsSearchDropdownOpen(true)}
                  className="w-full bg-transparent text-xs text-white placeholder-zinc-400 focus:outline-none"
                />
                <Search className="h-3.5 w-3.5 text-zinc-400 shrink-0 cursor-pointer hover:text-white" />
              </div>

              {/* Instant Search Dropdown */}
              {isSearchDropdownOpen && searchQuery.trim() && (
                <div
                  className="absolute top-10 right-0 left-0 sm:left-auto sm:w-72 rounded-xl border border-zinc-700 bg-[#1e2025] shadow-2xl p-2 z-50 max-h-80 overflow-y-auto"
                  onMouseLeave={() => setIsSearchDropdownOpen(false)}
                >
                  {searchResults.length > 0 ? (
                    searchResults.map((manga) => (
                      <Link
                        key={manga.id}
                        href={`/manga/${manga.slug}`}
                        onClick={() => setIsSearchDropdownOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-zinc-800 transition-colors"
                      >
                        <img
                          src={manga.cover}
                          alt={manga.title}
                          className="h-10 w-8 rounded object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-xs font-semibold text-white">
                            {manga.title}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                            {manga.rating > 0 && (
                              <>
                                <span className="text-amber-400 font-bold">★ {manga.rating}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>ตอนที่ {manga.latestChapter}</span>
                          </div>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="p-3 text-center text-xs text-zinc-400">
                      ไม่พบมังงะที่ค้นหา
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg bg-black/20 text-white shrink-0"
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-black/10 bg-[#3bcd88] px-4 py-3 space-y-2 text-xs font-bold text-white">
            <Link href="/" className="block py-1">
              อ่านมังงะ
            </Link>
            <Link href="/?type=MANHWA" className="block py-1">
              มังงะเกาหลี
            </Link>
            <Link href="/?type=MANHUA" className="block py-1">
              มังงะจีน
            </Link>
            <Link href="/?genre=พระเอกเทพ" className="block py-1">
              พระเอกเทพ
            </Link>
            <Link href="/bookmarks" className="block py-1">
              Bookmark
            </Link>
            <Link href="/import" className="block py-1 text-emerald-950 font-black">
              ดึงข้อมูลจาก URL (Scraper)
            </Link>
            <Link href="/watchlist" className="block py-1 text-emerald-950 font-black">
              ⚡ ระบบตั้งเวลาดึงอัตโนมัติ (Watchlist & Sync)
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
