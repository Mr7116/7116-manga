import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MangaListSection from "@/components/MangaListSection";
import { getAllMangas } from "@/lib/mangaService";

// Real-time server-rendered homepage (instant updates when new chapters appear)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const mangas = await getAllMangas();

  return (
    <div className="relative min-h-screen bg-[#0b0e14] text-zinc-100 flex flex-col">
      {/* Mystical Fantasy Anime Forest Background */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center opacity-30 filter saturate-150 blur-[1px]"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1920&auto=format&fit=crop&q=80')",
        }}
      />
      {/* Ambient Blue & Purple Fantasy Glow Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-gradient-to-b from-[#0b0e14]/80 via-[#0b0e14]/60 to-[#0b0e14]/90" />
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed top-1/3 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Navbar */}
      <div className="relative z-20">
        <Navbar />
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="relative z-10 flex-1 py-6 px-3 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <MangaListSection initialMangas={mangas} />
        </div>
      </main>

      {/* Footer */}
      <div className="relative z-10 mt-10">
        <Footer />
      </div>
    </div>
  );
}
