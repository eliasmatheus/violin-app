/**
 * Estilo de interface — "classic" (paleta Delphi) ou "violin".
 *
 * A preferência vive em `options.ui_style` (UserData) e é a mesma que as
 * Opções já gravam em "Geral → Estilo da Interface". Este composable expõe o
 * valor de forma reativa e carimba `[data-ui-style]` no `<html>` — é o que
 * ativa o bloco de tokens enxutos em tokens.css (ribbon de 44px, botões
 * só-ícone), do mesmo jeito que `[data-theme]` ativa as paletas.
 *
 * Quem decide por JS (tamanho de ícone, renderização da faixa contextual)
 * lê `isViolin`; quem decide por CSS lê o atributo no documento. As duas
 * vias acompanham a troca feita nas Opções em runtime porque o valor vem do
 * store do UserData, que é reativo.
 */

import { computed, watch, type ComputedRef, type WatchStopHandle } from "vue";
import $userdata from "@/helpers/UserData";
import { KEYS } from "@/constants/UserDataKeys";
import { THEMES } from "@/config/Theme";

function readUiStyle(): string {
  const stored = $userdata.get<string>(KEYS.OPTIONS.UI_STYLE, THEMES.CLASSIC);
  // Perfil gravado por um caminho antigo ou valor desconhecido cai no
  // clássico — nenhum bloco `[data-ui-style]` casa com lixo.
  return stored === THEMES.VIOLIN ? THEMES.VIOLIN : THEMES.CLASSIC;
}

interface UiStyleAPI {
  uiStyle: ComputedRef<string>;
  isViolin: ComputedRef<boolean>;
  /** Carimba `[data-ui-style]` no `<html>` com o valor atual. */
  applyUiStyle: () => string;
}

export function useUiStyle(): UiStyleAPI {
  const uiStyle = computed<string>(() => readUiStyle());
  const isViolin = computed<boolean>(() => uiStyle.value === THEMES.VIOLIN);

  function applyUiStyle(): string {
    const style = uiStyle.value;
    document.documentElement.dataset.uiStyle = style;
    return style;
  }

  return { uiStyle, isViolin, applyUiStyle };
}

/**
 * Mantém `[data-ui-style]` da janela em dia com a preferência. Uma chamada
 * por janela, no bootstrap: cobre a troca feita nas Opções desta janela e o
 * patch de UserData que vem de outra janela.
 */
export function startUiStyleSync(): WatchStopHandle {
  const { uiStyle, applyUiStyle } = useUiStyle();
  return watch(uiStyle, () => applyUiStyle(), { immediate: true });
}
