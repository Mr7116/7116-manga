import Navbar from "@/components/Navbar";
import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="relative min-h-screen bg-[#0b0e14] text-zinc-100 flex flex-col">
      <div className="relative z-20">
        <Navbar />
      </div>
      <main className="relative z-10 flex-1 py-12 px-4 flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4 bg-[#1e2025]/90 border border-zinc-800 p-8 rounded-2xl shadow-2xl backdrop-blur-md">
          <Loader2 className="h-10 w-10 animate-spin text-[#46e39a]" />
          <p className="text-sm font-semibold text-zinc-300 animate-pulse">กำลังโหลดข้อมูลมังงะ...</p>
        </div>
      </main>
    </div>
  );
}
