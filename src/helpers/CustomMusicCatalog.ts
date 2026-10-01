/** Índice leve do acervo pessoal para as buscas; slides e áudio são lidos só ao executar. */
import DocStore from "@/helpers/DocStore";
import { getSong } from "@/helpers/CustomSongs";
import Media from "@/composables/useMedia";
import { DB_TABLE } from "@/constants/DbTables";
import type { SearchMusicItem } from "@/types/Music";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function loadCustomMusicCatalog(): Promise<SearchMusicItem[]> {
  // Uma coletânea ilegível não deve esconder músicas que continuam disponíveis.
  const [songs, collections] = await Promise.all([
    DocStore.getAll<unknown>(DB_TABLE.CUSTOM_SONGS).catch(() => []),
    DocStore.getAll<unknown>(DB_TABLE.CUSTOM_COLLECTIONS).catch(() => []),
  ]);
  const namesBySong = new Map<string, Set<string>>();
  for (const collection of Array.isArray(collections) ? collections : []) {
    if (
      !record(collection) ||
      typeof collection.nome !== "string" ||
      !collection.nome.trim() ||
      !Array.isArray(collection.song_ids)
    )
      continue;
    for (const id of collection.song_ids) {
      if (typeof id !== "string" || !id.trim()) continue;
      const names = namesBySong.get(id) || new Set<string>();
      names.add(collection.nome.trim());
      namesBySong.set(id, names);
    }
  }

  const items = new Map<string, SearchMusicItem>();
  for (const song of Array.isArray(songs) ? songs : []) {
    if (
      !record(song) ||
      typeof song.id !== "string" ||
      !song.id.trim() ||
      typeof song.nome !== "string" ||
      !song.nome.trim() ||
      items.has(song.id)
    )
      continue;
    items.set(song.id, {
      // Compatibilidade com seletores existentes; execução usa sempre o UUID.
      id_music: -(items.size + 2),
      name: song.nome,
      custom_song_id: song.id,
      custom_collection_names: [...(namesBySong.get(song.id) || [])],
      has_instrumental_music: false,
      albums: [],
    });
  }
  return [...items.values()];
}

/** Único caminho de execução para busca rápida, paleta de comandos e tela de Músicas. */
export async function openCustomMusic(customSongId: string): Promise<void> {
  const song = await getSong(customSongId);
  if (song) await Media.openCustomSong(song);
}
