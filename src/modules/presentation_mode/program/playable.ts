import { LiturgyItemTypeEnum } from "@/enums/LiturgyItemTypeEnum";
import type { ProgramBibleRef, ProgramItem } from "@/types/Presentation";
import type { LibraryEntry } from "../composables/useFileLibrary";
import type { LiveKind } from "../composables/useLiveContent";
import type { MusicMode } from "./musicModes";
import { videoIdFromUrl } from "@/helpers/OnlineVideo";
import { samePassage, type BiblePassage } from "./bible";
import { kindFromPath } from "./liturgy";

/**
 * Algo que o operador pode pôr no palco e mandar ao ar: um item do programa,
 * um arquivo da biblioteca, uma música do acervo, um trecho da Bíblia ou um
 * vídeo do YouTube.
 *
 * O módulo guarda qual deles foi mandado ao ar — não tenta reconhecê-lo pelo
 * título que a projeção anuncia, que muda de formato conforme a origem (com ou
 * sem extensão) e se repete entre pastas.
 */
export type Playable =
  | { type: "program"; itemId: string }
  | { type: "file"; entry: LibraryEntry }
  | { type: "song"; id_music: number; title: string; subtitle?: string }
  | { type: "bible"; ref: ProgramBibleRef }
  | { type: "online"; videoId: string; title: string; channel?: string };

export function samePlayable(a: Playable, b: Playable): boolean {
  if (a.type === "program" && b.type === "program") return a.itemId === b.itemId;
  if (a.type === "file" && b.type === "file") return a.entry.path === b.entry.path;
  if (a.type === "song" && b.type === "song") return a.id_music === b.id_music;
  if (a.type === "bible" && b.type === "bible") return samePassage(a.ref, b.ref);
  if (a.type === "online" && b.type === "online") return a.videoId === b.videoId;
  return false;
}

/**
 * O que deve aparecer no ar quando um Playable foi mandado. `kind: null` é
 * "qualquer coisa": itens cujo efeito o módulo não acompanha (site, overlay).
 */
export interface LiveExpectation {
  kind: LiveKind | "audio" | null;
  /** Música: os slides no ar têm de ser desta. */
  songId?: number;
  /** Bíblia: o trecho no ar tem de ser este. */
  passage?: BiblePassage;
  /**
   * Vídeo do YouTube: o vídeo no ar tem de ser este. Ele pode estar no ar como
   * player embutido ou como arquivo (transmitido ou baixado) — o ID é o mesmo.
   */
  videoId?: string;
}

/** O que está no ar agora, do ponto de vista do palco. */
export interface LiveSignal {
  kind: LiveKind | null;
  audio: boolean;
  songId: number | null;
  passage: BiblePassage | null;
  videoId: string | null;
}

function fromPath(path: string): LiveExpectation {
  const kind = kindFromPath(path);
  if (kind === "image" || kind === "video") return { kind: "file" };
  if (kind === "audio") return { kind: "audio" };
  return { kind: null };
}

function fromMusic(idMusic: number, mode: MusicMode | string | undefined): LiveExpectation {
  if (mode === "audio" || mode === "audio_pb") return { kind: "audio" };
  return { kind: "music", songId: idMusic };
}

export function expectationOf(
  playable: Playable,
  item: ProgramItem | null,
  mode?: MusicMode
): LiveExpectation {
  if (playable.type === "file") return fromPath(playable.entry.path);
  if (playable.type === "song") return fromMusic(playable.id_music, mode);
  if (playable.type === "bible") return { kind: "bible", passage: playable.ref };
  if (playable.type === "online") return { kind: "online_video", videoId: playable.videoId };
  if (!item) return { kind: null };
  if (item.bible) return { kind: "bible", passage: item.bible };
  const src = item.source;
  switch (src?.tipo) {
    case LiturgyItemTypeEnum.MUSICA:
      return src.id_music && src.id_music > 0 && !src.escolha ? fromMusic(src.id_music, src.subtipo) : { kind: null };
    case LiturgyItemTypeEnum.ARQUIVO:
      return src.dir ? fromPath(src.dir) : { kind: null };
    case LiturgyItemTypeEnum.ANUNCIOS:
      return { kind: "announcements" };
    case LiturgyItemTypeEnum.VIDEO_ONLINE: {
      const videoId = videoIdFromUrl(src.url);
      return videoId ? { kind: "online_video", videoId } : { kind: "online_video" };
    }
    default:
      return { kind: null };
  }
}

/** O que foi mandado ao ar ainda é o que está no ar? */
export function isOnAir(expected: LiveExpectation, signal: LiveSignal): boolean {
  if (!signal.kind && !signal.audio) return false;
  if (expected.kind === null) return true;
  if (expected.kind === "audio") return signal.audio;
  if (expected.videoId !== undefined) return signal.videoId === expected.videoId;
  if (signal.kind !== expected.kind) return false;
  if (expected.passage && !(signal.passage && samePassage(expected.passage, signal.passage))) return false;
  return expected.songId === undefined || signal.songId === expected.songId;
}
