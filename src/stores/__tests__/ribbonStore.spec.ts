import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRibbonStore } from "@/stores/ribbonStore";
import $appdata from "@/helpers/AppData";
import $userdata from "@/helpers/UserData";
import { KEYS } from "@/constants/UserDataKeys";
import { THEMES } from "@/config/Theme";

/**
 * O esquema Violin muda a casa do menu contextual: em vez de virar aba da
 * ribbon, ele vira a faixa no topo do módulo (RibbonContextualStrip). A
 * store é quem precisa saber disso — daqui saem as duas superfícies
 * (abas visíveis e seleção da faixa), e um vazamento aqui colocaria o
 * contexto nos dois lugares ao mesmo tempo.
 */
describe("ribbonStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    $userdata.set(KEYS.OPTIONS.UI_STYLE, undefined);
    $appdata.set("active_module", null);
  });

  function store() {
    return useRibbonStore();
  }

  describe("estilo clássico (padrão)", () => {
    it("mostra a aba contextual do módulo ativo", () => {
      const s = store();
      $appdata.set("active_module", "bible");

      expect(s.visiblePages.some((p) => p.contextual)).toBe(true);
      expect(s.visiblePages.filter((p) => p.contextual).every((p) =>
        (p.activeOnModules || []).includes("bible")
      )).toBe(true);
    });

    it("esconde páginas contextuais quando nenhum módulo está ativo", () => {
      const s = store();
      expect(s.visiblePages.some((p) => p.contextual)).toBe(false);
    });

    it("selectPage em página contextual troca a aba normalmente", () => {
      const s = store();
      const ctxId = s.ctxPagesFor("bible")[0]?.id;
      expect(ctxId).toBeTruthy();

      s.selectPage(ctxId!);
      expect(s.activePage).toBe(ctxId);
    });

    it("selectContextualPageForModule segue a página contextual do módulo", () => {
      const s = store();
      const ctxId = s.ctxPagesFor("bible")[0]?.id;

      s.selectContextualPageForModule("bible");
      expect(s.activePage).toBe(ctxId);
    });
  });

  describe("estilo violin", () => {
    beforeEach(() => {
      $userdata.set(KEYS.OPTIONS.UI_STYLE, THEMES.VIOLIN);
    });

    it("remove as páginas contextuais das abas da ribbon", () => {
      const s = store();
      $appdata.set("active_module", "bible");

      expect(s.isViolin).toBe(true);
      expect(s.visiblePages.some((p) => p.contextual)).toBe(false);
      expect(s.visiblePages.length).toBeGreaterThan(0);
    });

    it("selectPage em contexto roteia para a faixa e não troca a aba", () => {
      const s = store();
      const ctxId = s.ctxPagesFor("bible")[0]?.id!;
      const antes = s.activePage;

      s.selectPage(ctxId);

      expect(s.activePage).toBe(antes);
      expect(s.selectedCtxPageId("bible")).toBe(ctxId);
    });

    it("selectContextualPageForModule não mexe na ribbon", () => {
      const s = store();
      const antes = s.activePage;

      s.selectContextualPageForModule("bible");

      expect(s.activePage).toBe(antes);
    });

    it("lembra a página contextual escolhida por módulo", () => {
      const s = store();
      const pages = s.ctxPagesFor("slide_editor");
      expect(pages.length).toBeGreaterThan(1);

      s.selectCtxPage("slide_editor", pages[1].id);
      expect(s.selectedCtxPageId("slide_editor")).toBe(pages[1].id);

      // Outro módulo não herda a escolha e volta ao padrão dele.
      expect(s.selectedCtxPageId("bible")).toBe(s.ctxPagesFor("bible")[0].id);
    });

    it("volta ao primeiro contexto quando a lembrança não existe mais", () => {
      const s = store();
      const pages = s.ctxPagesFor("slide_editor");
      s.selectCtxPage("slide_editor", pages[1].id);

      // Simula limpeza: a página lembrada sai da lista.
      s.selectCtxPage("slide_editor", "ctx_inexistente");
      expect(s.selectedCtxPageId("slide_editor")).toBe(pages[0].id);
    });
  });

  it("trocar o estilo em runtime muda o que a ribbon mostra", () => {
    const s = store();
    $appdata.set("active_module", "bible");

    expect(s.visiblePages.some((p) => p.contextual)).toBe(true);

    $userdata.set(KEYS.OPTIONS.UI_STYLE, THEMES.VIOLIN);
    expect(s.visiblePages.some((p) => p.contextual)).toBe(false);

    $userdata.set(KEYS.OPTIONS.UI_STYLE, THEMES.CLASSIC);
    expect(s.visiblePages.some((p) => p.contextual)).toBe(true);
  });
});

vi.mock("@/helpers/Telemetry", () => ({
  default: { track: vi.fn(), histogram: vi.fn(), markEnd: vi.fn() },
}));
