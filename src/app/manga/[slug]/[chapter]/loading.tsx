import { Loader2 } from "lucide-react";

export default function ChapterLoading() {
  return (
    <div className="min-h-screen bg-[#0b0e14] text-zinc-100 flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4 bg-[#1e2025]/90 border border-zinc-800 p-8 rounded-2xl shadow-2xl">
        <Loader2 className="h-10 w-10 animate-spin text-[#46e39a]" />
        <p className="text-sm font-semibold text-zinc-300 animate-pulse">กำลังโหลดรูปภาพและเนื้อหาตอน...</p>
      </div>
    </div>
  );
}
