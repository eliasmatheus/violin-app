import { LiturgyItemTypeEnum } from "@/enums/LiturgyItemTypeEnum";
import type { ProgramItem } from "@/types/Presentation";
import type { LibraryEntry } from "../composables/useFileLibrary";
import type { LiveKind } from "../composables/useLiveContent";
import type { MusicMode } from "./musicModes";
import { kindFromPath } from "./liturgy";

/**
 * Algo que o operador pode pôr no palco e mandar ao ar: um item do programa,
 * um arquivo da biblioteca ou uma música do acervo.
 *
 * O módulo guarda qual deles foi mandado ao ar — não tenta reconhecê-lo pelo
 * título que a projeção anuncia, que muda de formato conforme a origem (com ou
 * sem extensão) e se repete entre pastas.
 */
export type Playable =
  | { type: "program"; itemId: string }
  | { type: "file"; entry: LibraryEntry }
  | { type: "song"; id_music: number; title: string; subtitle?: string };

export function samePlayable(a: Playable, b: Playable): boolean {
  if (a.type === "program" && b.type === "program") return a.itemId === b.itemId;
  if (a.type === "file" && b.type === "file") return a.entry.path === b.entry.path;
  if (a.type === "song" && b.type === "song") return a.id_music === b.id_music;
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
}

/** O que está no ar agora, do ponto de vista do palco. */
export interface LiveSignal {
  kind: LiveKind | null;
  audio: boolean;
  songId: number | null;
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
  if (!item) return { kind: null };
  if (item.bible) return { kind: "bible" };
  const src = item.source;
  switch (src?.tipo) {
    case LiturgyItemTypeEnum.MUSICA:
      return src.id_music && src.id_music > 0 && !src.escolha ? fromMusic(src.id_music, src.subtipo) : { kind: null };
    case LiturgyItemTypeEnum.ARQUIVO:
      return src.dir ? fromPath(src.dir) : { kind: null };
    case LiturgyItemTypeEnum.ANUNCIOS:
      return { kind: "announcements" };
    case LiturgyItemTypeEnum.VIDEO_ONLINE:
      return { kind: "online_video" };
    default:
      return { kind: null };
  }
}

/** O que foi mandado ao ar ainda é o que está no ar? */
export function isOnAir(expected: LiveExpectation, signal: LiveSignal): boolean {
  if (!signal.kind && !signal.audio) return false;
  if (expected.kind === null) return true;
  if (expected.kind === "audio") return signal.audio;
  if (signal.kind !== expected.kind) return false;
  return expected.songId === undefined || signal.songId === expected.songId;
}
