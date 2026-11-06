import { notFound } from "next/navigation";
import { getChapter } from "@/lib/mangaService";
import MangaReader from "@/components/MangaReader";

// Cache chapter at Vercel Edge CDN for 1 hour (ISR)
// All subsequent loads and RSC prefetches are served instantly from Edge cache in <50ms
export const revalidate = 3600;

interface ReaderPageProps {
  params: Promise<{
    slug: string;
    chapter: string;
  }>;
}

export async function generateMetadata({ params }: ReaderPageProps) {
  const { slug, chapter } = await params;
  const chapterNum = parseFloat(chapter);
  const data = await getChapter(slug, chapterNum);

  if (!data) {
    return { title: "ไม่พบตอน - 7116-MANGA" };
  }

  return {
    title: `อ่าน ${data.manga.title} ตอนที่ ${chapterNum} แปลไทย - 7116-MANGA`,
    description: `อ่าน ${data.manga.title} ตอนที่ ${chapterNum} ฟรี คมชัด โหลดเร็ว`,
  };
}

export default async function ChapterReaderPage({ params }: ReaderPageProps) {
  const { slug, chapter } = await params;
  const chapterNum = parseFloat(chapter);

  if (isNaN(chapterNum)) {
    notFound();
  }

  const data = await getChapter(slug, chapterNum);

  if (!data) {
    notFound();
  }

  return <MangaReader manga={data.manga as any} currentChapter={data.chapter as any} />;
}
