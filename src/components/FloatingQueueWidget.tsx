"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueue } from "@/context/QueueContext";
import {
  Loader2,
  CheckCircle2,
  Square,
  ChevronDown,
  ChevronUp,
  Layers,
  ExternalLink,
  X,
} from "lucide-react";

export default function FloatingQueueWidget() {
  const pathname = usePathname();
  const {
    isQueueRunning,
    queueProgress,
    currentTaskDetail,
    queueItems,
    cancelQueue,
    clearQueue,
  } = useQueue();

  const [isMinimized, setIsMinimized] = useState(false);
  const [dismissedSuccess, setDismissedSuccess] = useState(false);

  // If on /import page, hide the floating widget since the full queue UI is right on the page
  const isImportPage = pathname === "/import";

  // Don't show if empty or on import page
  if (isImportPage || queueItems.length === 0) {
    return null;
  }

  // If finished and user dismissed, hide
  const isAllDone = !isQueueRunning && queueProgress.percent === 100;
  if (isAllDone && dismissedSuccess) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-[92vw] sm:w-96 select-none transition-all duration-300">
      {/* Minimized Pill Mode */}
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 rounded-full bg-[#16181d]/95 hover:bg-[#1f2229] border border-[#46e39a]/40 px-4 py-2.5 shadow-2xl backdrop-blur-md text-xs font-bold text-white transition-all cursor-pointer hover:scale-105"
        >
          {isQueueRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#46e39a]" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-[#46e39a]" />
          )}
          <span>
            {isQueueRunning
              ? `กำลังดึงในพื้นหลัง (${queueProgress.percent}%)`
              : `ดึงข้อมูลเสร็จสิ้น (${queueProgress.total} เรื่อง)`}
          </span>
          <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
        </button>
      ) : (
        /* Expanded Floating Card Mode */
        <div className="rounded-2xl border border-zinc-700/80 bg-[#16181d]/95 p-4 shadow-2xl backdrop-blur-md text-zinc-100">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {isQueueRunning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#46e39a] opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isQueueRunning ? "bg-[#46e39a]" : "bg-emerald-500"
                  }`}
                />
              </span>
              <h4 className="text-xs font-black tracking-wide text-white flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#46e39a]" />
                <span>
                  {isQueueRunning ? "ดึงข้อมูลในพื้นหลังต่อเนื่อง..." : "งานในคิวเสร็จสิ้น"}
                </span>
              </h4>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                title="ย่อขนาด"
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {isAllDone && (
                <button
                  onClick={() => setDismissedSuccess(true)}
                  title="ปิดการแจ้งเตือน"
                  className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="py-3 space-y-2.5">
            {isQueueRunning && currentTaskDetail ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white truncate max-w-[200px]">
                    {currentTaskDetail.mangaTitle}
                  </span>
                  <span className="text-[11px] text-[#46e39a] font-mono">
                    เรื่องที่ {queueProgress.current}/{queueProgress.total}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  {currentTaskDetail.step}
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-300">
                {isAllDone
                  ? `นำเข้าครบทั้ง ${queueProgress.total} เรื่องเรียบร้อยแล้ว`
                  : `มี ${queueItems.length} รายการในคิว`}
              </p>
            )}

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>ความคืบหน้ารวม</span>
                <span className="text-[#46e39a] font-bold">{queueProgress.percent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-[#46e39a] transition-all duration-300"
                  style={{ width: `${queueProgress.percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-2 text-xs">
            <Link
              href="/import"
              className="inline-flex items-center gap-1 text-[11px] text-[#46e39a] hover:underline font-bold"
            >
              <span>เปิดดูหน้า Import</span>
              <ExternalLink className="h-3 w-3" />
            </Link>

            <div className="flex items-center gap-1.5">
              {isQueueRunning ? (
                <button
                  type="button"
                  onClick={cancelQueue}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-bold border border-rose-500/30 transition-colors"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  <span>หยุดชั่วคราว</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={clearQueue}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  ล้างคิว
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
