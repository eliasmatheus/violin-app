export interface LibrasCacheEntry {
  id: string;
  type: "music" | "bible";
  ref_id: string;
  lang: string;
  original_text: string;
  gloss: string;
  tokens: string[];
  bundles_cached: boolean;
  bundles_size: number;
  created_at: string;
  updated_at: string;
}

export interface LibrasCacheStats {
  total_entries: number;
  music_count: number;
  bible_count: number;
  bundles_count: number;
  total_gloss_bytes: number;
  total_bundles_bytes: number;
  total_bytes: number;
}

/** Referências para reproduzir uma entrada sem alterar o payload do tradutor. */
export interface LibrasTranslationContext {
  operation?: "direct" | "live_music" | "live_bible" | "download_music" | "download_bible";
  part?: "text" | "slide" | "verse";
  operationId?: string;
  musicId?: number;
  slideIndex?: number;
  bibleVersion?: string;
  bibleBookId?: number;
  bibleChapter?: number;
  bibleVerses?: number[];
}
