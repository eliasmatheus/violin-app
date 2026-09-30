import { ref } from "vue";
import type { LibraryEntry } from "./useFileLibrary";

/**
 * O que está no palco central. Segue o FreeShow: um clique leva o item para
 * a prévia, dois cliques o põem no ar. O palco não é espelho da tela — isso
 * são as miniaturas da coluna de saídas. Quando o item em prévia é o que está
 * no ar, o palco vira o controle dele (grade ativa, barra do vídeo).
 */
export type PreviewTarget =
  | { type: "program"; itemId: string }
  | { type: "file"; entry: LibraryEntry }
  | { type: "song"; id_music: number; title: string; subtitle?: string };

const _target = ref<PreviewTarget | null>(null);

export function usePreview() {
  return {
    target: _target,
    show(target: PreviewTarget | null): void {
      _target.value = target;
    },
  };
}
