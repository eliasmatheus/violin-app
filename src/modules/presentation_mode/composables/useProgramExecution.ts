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

/** Versões da música que têm letra para a grade (as de "só áudio" não têm). */
const SLIDE_MODES: Record<string, MusicActionEnum> = {
  sung: MusicActionEnum.AUDIO,
  pb: MusicActionEnum.INSTRUMENTAL,
  lyric: MusicActionEnum.NO_AUDIO,
  no_audio: MusicActionEnum.NO_AUDIO,
};

/**
 * Música com letra toca minimizada: os slides vão para a grade do palco do
 * módulo, e não para a janela do player por cima dele. O resto — música a
 * escolher na hora, personalizada, só áudio — segue o caminho da liturgia.
 */
function playMusicOnStage(source: LiturgyItem): boolean {
  const mode = SLIDE_MODES[source.subtipo || "sung"];
  if (!mode || source.escolha || !source.id_music || source.id_music < 0) return false;
  void Media.open({ id_music: source.id_music, mode, minimized: true });
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

  async function projectBible(ref: ProgramBibleRef): Promise<void> {
    $userdata.set(KEYS.MODULES.BIBLE.IS_PLAYING, true);
    await ProjectionWindows.openBibleWindow();
    Broadcast.send(BROADCAST_TYPE.BIBLE_VERSE_INTENT, {
      text: ref.text,
      reference: ref.reference,
      book_id: ref.book_id,
      chapter: ref.chapter,
      verses: ref.verses,
      version_id: ref.version_id,
      active: true,
    });
  }

  /**
   * Item com sub-itens (anúncios) não projeta: o operador escolhe o sub-item.
   * Devolve se algo foi enviado para execução.
   */
  function execute(item: ProgramItem): boolean {
    if (item.children?.length) return false;
    if (item.bible) {
      void projectBible(item.bible).catch((error: unknown) => {
        Telemetry.captureException(error, { source: "presentation_mode.execute.bible" });
      });
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

  return { execute, projectPath };
}
