"use client";

import { useState, useEffect } from "react";

export const READ_CHAPTERS_KEY = "gomanga_read_chapters";

/**
 * Get all read chapter numbers for a given manga slug
 */
export function getReadChapters(slug: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(READ_CHAPTERS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const list = data[slug];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Check if a specific chapter has been read
 */
export function isChapterRead(slug: string, chapterNumber: number): boolean {
  const list = getReadChapters(slug);
  return list.includes(chapterNumber);
}

/**
 * Mark a chapter as read
 */
export function markChapterAsRead(slug: string, chapterNumber: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(READ_CHAPTERS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const list: number[] = Array.isArray(data[slug]) ? data[slug] : [];

    if (!list.includes(chapterNumber)) {
      list.push(chapterNumber);
      data[slug] = list;
      localStorage.setItem(READ_CHAPTERS_KEY, JSON.stringify(data));
      window.dispatchEvent(new Event("manga-read-updated"));
    }
  } catch (err) {
    console.error("Failed to mark chapter as read:", err);
  }
}

/**
 * React hook to listen for reading status updates in real-time
 */
export function useReadChapters(slug?: string) {
  const [readMap, setReadMap] = useState<Record<string, number[]>>({});

  const reload = () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(READ_CHAPTERS_KEY);
      if (raw) {
        setReadMap(JSON.parse(raw));
      }
    } catch {}
  };

  useEffect(() => {
    reload();

    const handleUpdate = () => reload();
    window.addEventListener("manga-read-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener("manga-read-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  if (slug) {
    return readMap[slug] || [];
  }

  return readMap;
}
