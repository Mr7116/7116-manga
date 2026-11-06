export interface Chapter {
  id: string;
  number: number;
  title: string;
  releaseDate: string;
  pages: string[];
}

export interface Manga {
  id: string;
  slug: string;
  title: string;
  thaiTitle?: string;
  nativeTitle?: string;
  cover: string;
  banner?: string;
  synopsis: string;
  status: "Ongoing" | "Completed";
  type: "MANHWA" | "MANHUA" | "MANGA";
  isColor?: boolean;
  genres: string[];
  rating: number;
  ratingCount: number;
  views: string;
  author: string;
  artist: string;
  updatedAt: string;
  latestChapter: number;
  chapters: Chapter[];
}

// Empty - Real data is stored in SQLite Database
export const sampleMangas: Manga[] = [];

export const allGenres = [
  "Genre All",
  "Action",
  "Fantasy",
  "Adventure",
  "Romance",
  "Comedy",
  "Isekai",
  "Martial Arts",
  "Supernatural",
  "Drama",
  "พระเอกเทพ",
];
