import { hymnalTracks } from "@/helpers/Hymnal";
import Strings from "@/helpers/Strings";
import { musicAlbumLabel, prepareMusicCatalog } from "@root/config/musicCatalog.mjs";
import type { LiturgyMusicItem } from "@/types/Liturgy";

// `type`, não `interface`: só o alias tem a assinatura de índice implícita que o
// LjCombobox exige dos itens.
export type MusicOption = {
  value: number;
  label: string;
  /** Nome do CD: títulos iguais existem em mais de um. */
  detail: string;
  /** Chaves de busca, normalizadas uma vez por lista e não a cada tecla. */
  nameKey: string;
  albumKey: string;
  tracks: number[];
};

export function buildMusicOptions(musics: LiturgyMusicItem[], customLabel = ""): MusicOption[] {
  return prepareMusicCatalog(musics).map((m) => {
    const detail = musicAlbumLabel(m, customLabel);
    return {
      value: Number(m.id_music),
      label: m.name,
      detail,
      nameKey: Strings.clean(m.name),
      albumKey: Strings.clean(detail),
      tracks: hymnalTracks(m),
    };
  });
}

/** Mesma regra da busca de músicas: trecho do nome ou do CD, ou o número do hino. */
export function musicMatches(option: MusicOption, term: string): boolean {
  if (/^\d+$/.test(term)) return option.tracks.includes(Number(term));
  return option.nameKey.includes(term) || option.albumKey.includes(term);
}
