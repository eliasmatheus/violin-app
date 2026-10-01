import $userdata from "@/helpers/UserData";
import Broadcast from "@/helpers/Broadcast";
import ProjectionWindows from "@/helpers/ProjectionWindows";
import Telemetry from "@/helpers/Telemetry";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { KEYS } from "@/constants/UserDataKeys";
import { LiturgyItemTypeEnum } from "@/enums/LiturgyItemTypeEnum";
import { MusicActionEnum } from "@/enums/MusicActionEnum";
import Media from "@/composables/useMedia";
import type { LiturgyItem } from "@/types/Liturgy";
import { useLiturgyExecution } from "@/modules/liturgy/composables/useLiturgyExecution";
import type { ProgramBibleRef, ProgramItem } from "@/types/Presentation";
import { liturgyItem } from "../program/liturgy";
import type { MusicMode } from "../program/musicModes";
import { nextVerseOf } from "../program/bible";
import { useBibleLibrary } from "./useBibleLibrary";

/** Versões da música que têm letra para a grade. */
const SLIDE_MODES: Record<string, MusicActionEnum> = {
  sung: MusicActionEnum.AUDIO,
  pb: MusicActionEnum.INSTRUMENTAL,
  lyric: MusicActionEnum.NO_AUDIO,
  no_audio: MusicActionEnum.NO_AUDIO,
};

/**
 * Toca uma música no formato pedido. Com letra, ela vai minimizada — os
 * slides aparecem na grade do palco do módulo, não na janela do player por
 * cima dele. "Só áudio" toca sem mandar nada às telas e aparece no palco
 * com o player.
 */
export function playMusicInMode(idMusic: number, mode: MusicMode | string = "sung"): void {
  if (mode === "audio" || mode === "audio_pb") {
    Media.stop();
    void Media.openAudio({
      id_music: idMusic,
      mode: mode === "audio_pb" ? MusicActionEnum.INSTRUMENTAL : MusicActionEnum.AUDIO,
    });
    return;
  }
  void Media.open({ id_music: idMusic, mode: SLIDE_MODES[mode] ?? MusicActionEnum.AUDIO, minimized: true });
}

/** Música a escolher na hora e música personalizada seguem o caminho da liturgia. */
function playMusicOnStage(source: LiturgyItem): boolean {
  if (source.escolha || !source.id_music || source.id_music < 0) return false;
  playMusicInMode(source.id_music, source.subtipo || "sung");
  return true;
}

/**
 * Executar um item do programa.
 *
 * Música com letra vai para a grade do palco (F3). O resto, até o palco saber
 * mostrar (F4), é o motor da liturgia: arquivo vai para a projeção, e assim
 * por diante.
 * O versículo, que a liturgia não conhece, segue o caminho do BibleSpotlight —
 * a autoridade da Bíblia no shell transforma a intenção no versículo projetado.
 */
export function useProgramExecution() {
  const { executeItem } = useLiturgyExecution();
  const bible = useBibleLibrary();

  /** O retorno de palco mostra o versículo seguinte quando o capítulo é conhecido. */
  async function nextOf(ref: ProgramBibleRef): Promise<{ text: string; reference: string } | null> {
    const chapter = await bible.chapterOf(ref);
    return chapter ? nextVerseOf(chapter, ref.verses) : null;
  }

  async function projectBible(ref: ProgramBibleRef): Promise<void> {
    $userdata.set(KEYS.MODULES.BIBLE.IS_PLAYING, true);
    const [next] = await Promise.all([nextOf(ref), ProjectionWindows.openBibleWindow()]);
    Broadcast.send(BROADCAST_TYPE.BIBLE_VERSE_INTENT, {
      text: ref.text,
      reference: ref.reference,
      book_id: ref.book_id,
      chapter: ref.chapter,
      verses: ref.verses,
      version_id: ref.version_id,
      next_text: next?.text ?? "",
      next_reference: next?.reference ?? "",
      active: true,
    });
  }

  function sendBible(ref: ProgramBibleRef): void {
    void projectBible(ref).catch((error: unknown) => {
      Telemetry.captureException(error, { source: "presentation_mode.execute.bible" });
    });
  }

  /**
   * Item com sub-itens (anúncios) não projeta: o operador escolhe o sub-item.
   * Devolve se algo foi enviado para execução.
   */
  function execute(item: ProgramItem): boolean {
    if (item.children?.length) return false;
    if (item.bible) {
      sendBible(item.bible);
      return true;
    }
    if (item.source) {
      if (item.source.tipo === LiturgyItemTypeEnum.MUSICA && playMusicOnStage(item.source)) return true;
      executeItem(item.source);
      return true;
    }
    return false;
  }

  /** Um arquivo solto (biblioteca) vai para a tela principal como um item de arquivo da liturgia. */
  function projectPath(path: string, name: string): void {
    executeItem(liturgyItem({ id: crypto.randomUUID(), tipo: LiturgyItemTypeEnum.ARQUIVO, dir: path, item: name }));
  }

  return { execute, projectPath, sendBible };
}
