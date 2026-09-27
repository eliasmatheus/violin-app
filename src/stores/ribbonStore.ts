import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getRibbonModules } from "@/config/modules";
import type { RibbonPage } from "@/types/Ribbon";
import $appdata from "@/helpers/AppData";
import $userdata from "@/helpers/UserData";
import $modules from "@/helpers/Modules";
import Telemetry from "@/helpers/Telemetry";
import { KEYS } from "@/constants/UserDataKeys";
import { THEMES } from "@/config/Theme";

export const useRibbonStore = defineStore("ribbon", () => {
  const pages: RibbonPage[] = getRibbonModules;

  const activePage = ref("collections");

  /**
   * Estilo de interface — em Violin as páginas contextuais saem da ribbon:
   * quem as mostra é a faixa no topo do módulo (RibbonContextualStrip), e
   * a store deixa de selecioná-las aqui. Leitura reativa do UserData.
   */
  const isViolin = computed(
    () => $userdata.get<string>(KEYS.OPTIONS.UI_STYLE, THEMES.CLASSIC) === THEMES.VIOLIN
  );

  const activeModuleId = computed(() => $appdata.get("active_module") as string | null);

  const visiblePages = computed(() =>
    pages.filter((p) => {
      if (p.contextual) {
        if (isViolin.value) return false;
        if (!activeModuleId.value) return false;
        return (p.activeOnModules || []).includes(activeModuleId.value);
      }
      return true;
    })
  );

  /** Páginas contextuais que pertencem a um módulo. */
  function ctxPagesFor(moduleId: string | null): RibbonPage[] {
    if (!moduleId) return [];
    return pages.filter(
      (p) => p.contextual && (p.activeOnModules || []).includes(moduleId)
    );
  }

  /**
   * Seleção da faixa contextual (Violin), lembrada por módulo: ao voltar para
   * o Editor de Slides o operador reencontra a aba que estava usando.
   */
  const ctxSelections = ref<Record<string, string>>({});

  function selectedCtxPageId(moduleId: string | null): string | null {
    const list = ctxPagesFor(moduleId);
    if (!list.length) return null;
    const saved = moduleId ? ctxSelections.value[moduleId] : undefined;
    return saved && list.some((p) => p.id === saved) ? saved : list[0].id;
  }

  function selectCtxPage(moduleId: string | null, pageId: string): void {
    if (!moduleId) return;
    const previous = selectedCtxPageId(moduleId);
    if (previous === pageId) {
      Telemetry.track("ribbon_page_focused", { page_id: pageId });
      return;
    }
    ctxSelections.value = { ...ctxSelections.value, [moduleId]: pageId };
    Telemetry.track("ribbon_page_opened", { page_id: pageId, from_page: previous });
  }

  function selectPage(id: string) {
    const page = pages.find((p) => p.id === id);

    // Em Violin a página contextual não é assunto da ribbon: roteia para a
    // faixa do módulo (BibleSpotlight/bible_search mandam ctx_bible aqui).
    if (page?.contextual && isViolin.value) {
      selectCtxPage((page.activeOnModules || [])[0] ?? null, id);
      return;
    }

    const previousPage = activePage.value;
    if (previousPage === id) {
      Telemetry.track("ribbon_page_focused", { page_id: id });
      return;
    }
    activePage.value = id;
    Telemetry.track("ribbon_page_opened", { page_id: id, from_page: previousPage });
    if (page?.defaultModule) $modules.open(page.defaultModule);
  }

  /**
   * Aba contextual do módulo que acabou de abrir (comportamento clássico).
   * Em Violin é no-op — a faixa do módulo resolve o próprio conteúdo.
   */
  function selectContextualPageForModule(moduleId: string | null): void {
    if (!moduleId || isViolin.value) return;
    const ctxPage = pages.find(
      (p: RibbonPage) => p.contextual && (p.activeOnModules || []).includes(moduleId)
    );
    if (ctxPage) selectPage(ctxPage.id);
  }

  return {
    activePage,
    isViolin,
    visiblePages,
    selectPage,
    selectContextualPageForModule,
    ctxPagesFor,
    selectedCtxPageId,
    selectCtxPage,
  };
});
