"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";

export interface BatchQueueItem {
  id: string;
  url: string;
  slug?: string;
  title?: string;
  cover?: string;
  totalChapters: number;
  completedChapters: number;
  skippedChapters: number;
  status: "idle" | "scraping_meta" | "saving_manga" | "downloading_chapters" | "success" | "error" | "cancelled";
  statusText: string;
  error?: string;
}

interface QueueProgress {
  current: number;
  total: number;
  percent: number;
}

interface CurrentTaskDetail {
  mangaTitle: string;
  mangaCover?: string;
  chapterTitle?: string;
  step: string;
}

interface QueueContextType {
  queueItems: BatchQueueItem[];
  isQueueRunning: boolean;
  queueProgress: QueueProgress;
  currentTaskDetail: CurrentTaskDetail | null;
  startQueue: (urls: string[], options?: { autoWatchlist?: boolean; depth?: "all" | "recent" | "meta_only" }) => Promise<void>;
  cancelQueue: () => void;
  clearQueue: () => void;
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

const STORAGE_KEY = "manga_batch_import_queue";

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const [queueItems, setQueueItems] = useState<BatchQueueItem[]>([]);
  const [isQueueRunning, setIsQueueRunning] = useState<boolean>(false);
  const [queueProgress, setQueueProgress] = useState<QueueProgress>({ current: 0, total: 0, percent: 0 });
  const [currentTaskDetail, setCurrentTaskDetail] = useState<CurrentTaskDetail | null>(null);

  const cancelRef = useRef<boolean>(false);

  // Load initial state from localStorage if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          // If was running when tab closed, mark currently downloading as idle or cancelled
          const restoredItems = parsed.items.map((it: BatchQueueItem) => {
            if (it.status === "downloading_chapters" || it.status === "scraping_meta" || it.status === "saving_manga") {
              return { ...it, status: "idle", statusText: "รอดำเนินการต่อ" };
            }
            return it;
          });
          setQueueItems(restoredItems);
          const done = restoredItems.filter((i: BatchQueueItem) => i.status === "success").length;
          setQueueProgress({
            current: done,
            total: restoredItems.length,
            percent: Math.round((done / restoredItems.length) * 100),
          });
        }
      }
    } catch {}
  }, []);

  // Save to localStorage on changes
  useEffect(() => {
    if (queueItems.length > 0) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            items: queueItems,
            updatedAt: Date.now(),
          })
        );
      } catch {}
    }
  }, [queueItems]);

  const cancelQueue = () => {
    cancelRef.current = true;
    setIsQueueRunning(false);
    setCurrentTaskDetail(null);
    setQueueItems((prev) =>
      prev.map((item) =>
        item.status === "idle" || item.status === "downloading_chapters" || item.status === "scraping_meta"
          ? { ...item, status: "cancelled", statusText: "ยกเลิกคิวแล้ว" }
          : item
      )
    );
  };

  const clearQueue = () => {
    cancelRef.current = true;
    setIsQueueRunning(false);
    setQueueItems([]);
    setQueueProgress({ current: 0, total: 0, percent: 0 });
    setCurrentTaskDetail(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const startQueue = async (
    urls: string[],
    options?: { autoWatchlist?: boolean; depth?: "all" | "recent" | "meta_only" }
  ) => {
    if (urls.length === 0) return;

    const autoWatchlist = options?.autoWatchlist ?? true;
    const depth = options?.depth ?? "all";

    cancelRef.current = false;
    setIsQueueRunning(true);

    // Initialize items
    const initialItems: BatchQueueItem[] = urls.map((u, i) => ({
      id: `queue-${i}-${Date.now()}`,
      url: u,
      totalChapters: 0,
      completedChapters: 0,
      skippedChapters: 0,
      status: "idle",
      statusText: "รอดำเนินการในคิว",
    }));

    setQueueItems(initialItems);
    setQueueProgress({ current: 0, total: urls.length, percent: 0 });

    // Step 0: Eagerly register all URLs into WatchedManga in Database
    // So even if user completely shuts down the computer/browser, URLs are preserved in DB!
    if (autoWatchlist) {
      for (const u of urls) {
        try {
          fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: u,
              scanNow: false,
            }),
          }).catch(() => {});
        } catch {}
      }
    }

    for (let i = 0; i < initialItems.length; i++) {
      if (cancelRef.current) {
        setQueueItems((prev) =>
          prev.map((item, idx) =>
            idx >= i && item.status === "idle"
              ? { ...item, status: "cancelled", statusText: "ยกเลิกคิวแล้ว" }
              : item
          )
        );
        break;
      }

      const item = initialItems[i];

      setQueueItems((prev) =>
        prev.map((it, idx) =>
          idx === i
            ? { ...it, status: "scraping_meta", statusText: "กำลังดึงข้อมูลเรื่องและรายชื่อตอน..." }
            : it
        )
      );

      setCurrentTaskDetail({
        mangaTitle: item.title || item.url,
        mangaCover: item.cover,
        step: "กำลังดึงข้อมูลเรื่อง...",
      });

      setQueueProgress({
        current: i + 1,
        total: initialItems.length,
        percent: Math.round((i / initialItems.length) * 100),
      });

      try {
        // 1. Scrape Series Meta
        const scrapeRes = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: item.url }),
        });

        if (scrapeRes.status === 401) {
          throw new Error("เซสชันผู้ดูแลหมดอายุ กรุณาเข้าสู่ระบบใหม่ที่ /login");
        }
        const scrapeData = await scrapeRes.json();
        if (!scrapeRes.ok || !scrapeData.success || !scrapeData.data) {
          throw new Error(scrapeData.error || "ดึงข้อมูลจากเว็บต้นทางไม่สำเร็จ");
        }

        const seriesData = scrapeData.data;
        const totalWeb = seriesData.chapters ? seriesData.chapters.length : 0;

        setQueueItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  title: seriesData.title,
                  cover: seriesData.cover,
                  slug: seriesData.slug,
                  totalChapters: totalWeb,
                  status: "saving_manga",
                  statusText: `พบ ${totalWeb} ตอน | กำลังบันทึกข้อมูลเรื่องลงระบบ...`,
                }
              : it
          )
        );

        setCurrentTaskDetail({
          mangaTitle: seriesData.title,
          mangaCover: seriesData.cover,
          step: `พบ ${totalWeb} ตอน | บันทึกเรื่อง...`,
        });

        // 2. Save Series Metadata in DB
        const saveRes = await fetch("/api/manga/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: item.url,
            seriesUrl: item.url,
            title: seriesData.title,
            cover: seriesData.cover,
            synopsis: seriesData.synopsis,
            images: seriesData.images || [],
            chapters: seriesData.chapters || [],
            genres: seriesData.genres,
            type: seriesData.type,
            status: seriesData.status,
            author: seriesData.author,
            artist: seriesData.artist,
          }),
        });

        const saveData = await saveRes.json();
        if (!saveRes.ok || !saveData.success) {
          throw new Error(saveData.error || "บันทึกข้อมูลมังงะลงระบบไม่สำเร็จ");
        }

        const resolvedSlug = saveData.manga?.slug || seriesData.slug;

        // 3. Add to Watchlist
        if (autoWatchlist) {
          try {
            await fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: item.url,
                scanNow: false,
                title: seriesData.title,
                slug: resolvedSlug,
                cover: seriesData.cover,
                latestChapterOnWeb: totalWeb,
              }),
            });
          } catch {}
        }

        if (depth === "meta_only" || totalWeb === 0) {
          setQueueItems((prev) =>
            prev.map((it, idx) =>
              idx === i
                ? {
                    ...it,
                    status: "success",
                    statusText: `บันทึกข้อมูลเรื่องและติดตามเรียบร้อยแล้ว (${totalWeb} ตอน)`,
                  }
                : it
            )
          );
          continue;
        }

        // 4. Query Existing Chapters for 0ms skip
        let existingNums: number[] = [];
        try {
          const exRes = await fetch(`/api/manga/existing-chapters?slug=${encodeURIComponent(resolvedSlug)}`);
          if (exRes.ok) {
            const exData = await exRes.json();
            if (exData.success) {
              existingNums = exData.existingNumbers || exData.chapters || [];
            }
          }
        } catch {}

        const existingSet = new Set<number>(existingNums);

        let rawChapters = [...seriesData.chapters].reverse(); // Oldest first
        if (depth === "recent") {
          rawChapters = rawChapters.slice(-5);
        }

        const chaptersToDownload = rawChapters.map((ch: any, idx: number) => {
          const match = ch.title?.match(/ตอนที่\s*(\d+(\.\d+)?)/i) || ch.url?.match(/ตอนที่-(\d+(\.\d+)?)/i);
          const num =
            typeof ch.number === "number"
              ? ch.number
              : match
                ? parseFloat(match[1])
                : idx + 1;
          return {
            ...ch,
            chapterNumber: num,
          };
        });

        const missingChapters = chaptersToDownload.filter(
          (ch: any) => !existingSet.has(ch.chapterNumber)
        );

        const skippedCount = chaptersToDownload.length - missingChapters.length;

        setQueueItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  skippedChapters: skippedCount,
                  status: "downloading_chapters",
                  statusText:
                    missingChapters.length === 0
                      ? `ข้ามตอนเดิมทั้งหมด ${skippedCount} ตอน (ครบถ้วนแล้ว)`
                      : `ข้ามตอนเดิม ${skippedCount} ตอน | กำลังดาวน์โหลดตอนใหม่ ${missingChapters.length} ตอน...`,
                }
              : it
          )
        );

        let completedInThisItem = 0;

        for (let chIdx = 0; chIdx < missingChapters.length; chIdx++) {
          if (cancelRef.current) break;

          const ch = missingChapters[chIdx];

          setQueueItems((prev) =>
            prev.map((it, idx) =>
              idx === i
                ? {
                    ...it,
                    completedChapters: completedInThisItem,
                    statusText: `ดาวน์โหลดตอนใหม่: ${ch.title} (${chIdx + 1}/${missingChapters.length})...`,
                  }
                : it
            )
          );

          setCurrentTaskDetail({
            mangaTitle: seriesData.title,
            mangaCover: seriesData.cover,
            chapterTitle: ch.title,
            step: `ดาวน์โหลด ${ch.title} (${chIdx + 1}/${missingChapters.length})`,
          });

          try {
            const chScrapeRes = await fetch("/api/scrape", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: ch.url }),
            });

            if (chScrapeRes.ok) {
              const chScrapeData = await chScrapeRes.json();
              const chapterImages: string[] =
                chScrapeData.data?.images || chScrapeData.data?.pages || [];

              if (chapterImages.length > 0) {
                const saveChapterRes = await fetch("/api/manga/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: ch.url,
                    seriesUrl: item.url,
                    slug: resolvedSlug,
                    title: seriesData.title,
                    cover: seriesData.cover,
                    synopsis: seriesData.synopsis,
                    images: chapterImages,
                    chapterNumber: ch.chapterNumber,
                    chapterTitle: ch.title,
                  }),
                });

                if (saveChapterRes.ok) {
                  completedInThisItem++;
                }
              }
            }
          } catch (chErr) {
            console.error(`Failed to download chapter ${ch.title}:`, chErr);
          }

          // Small delay to prevent network congestions
          await new Promise((r) => setTimeout(r, 200));
        }

        // Update Watchlist latestChapterInDb
        if (autoWatchlist) {
          try {
            await fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: item.url,
                scanNow: false,
                latestChapterInDb: skippedCount + completedInThisItem,
              }),
            });
          } catch {}
        }

        setQueueItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "success",
                  completedChapters: completedInThisItem,
                  statusText: `สำเร็จ: ข้ามตอนเดิม ${skippedCount} ตอน | โหลดตอนใหม่ ${completedInThisItem} ตอน`,
                }
              : it
          )
        );
      } catch (err: any) {
        setQueueItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "error",
                  error: err.message || "เกิดข้อผิดพลาดในการประมวลผล",
                  statusText: `ข้อผิดพลาด: ${err.message || "ไม่สามารถดึงข้อมูลได้"}`,
                }
              : it
          )
        );
      }
    }

    setIsQueueRunning(false);
    setCurrentTaskDetail(null);
    setQueueProgress((prev) => ({ ...prev, percent: 100 }));
  };

  return (
    <QueueContext.Provider
      value={{
        queueItems,
        isQueueRunning,
        queueProgress,
        currentTaskDetail,
        startQueue,
        cancelQueue,
        clearQueue,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
}

export function useQueue() {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error("useQueue must be used within a QueueProvider");
  }
  return context;
}
