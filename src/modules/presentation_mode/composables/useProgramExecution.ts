import $userdata from "@/helpers/UserData";
import Broadcast from "@/helpers/Broadcast";
import ProjectionWindows from "@/helpers/ProjectionWindows";
import Telemetry from "@/helpers/Telemetry";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { KEYS } from "@/constants/UserDataKeys";
import { useLiturgyExecution } from "@/modules/liturgy/composables/useLiturgyExecution";
import type { ProgramBibleRef, ProgramItem } from "@/types/Presentation";

/**
 * Executar um item do programa.
 *
 * Até o palco do módulo existir (F2–F4), quem executa é o motor da liturgia:
 * música abre o player, arquivo vai para a projeção, e assim por diante.
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
      executeItem(item.source);
      return true;
    }
    return false;
  }

  return { execute };
}
