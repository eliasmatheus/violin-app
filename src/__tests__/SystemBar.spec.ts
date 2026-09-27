import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import SystemBar from "@/layout/SystemBar.vue";
import RibbonTabs from "@/components/RibbonTabs.vue";
import $appdata from "@/helpers/AppData";
import $userdata from "@/helpers/UserData";
import { KEYS } from "@/constants/UserDataKeys";
import { THEMES } from "@/config/Theme";
import { makeI18n } from "@/components/ui/__tests__/mountUi";

// ShellTools/AppMenu não são o alvo aqui, e o ShellTools puxa
// useLibrasState — que lê localStorage no topo do módulo, antes de qualquer
// teste conseguir stubar. Mockar corta a cadeia inteira.
vi.mock("@/layout/shell/ShellTools.vue", () => ({
  default: { name: "ShellTools", template: "<div />" },
}));
vi.mock("@/layout/shell/AppMenu.vue", () => ({
  default: { name: "AppMenu", template: "<div />" },
}));

/**
 * No Windows e no Linux os botões de janela são do sistema, e o Electron os
 * desenha por cima da systembar com uma altura própria (`titleBarOverlay`).
 * Essa altura mora em JS, no processo principal, e a da systembar mora em CSS:
 * são dois números que precisam ser o mesmo. Se a barra crescer e a faixa não,
 * os botões ficam presos no topo, fora do eixo do título, e nada avisa.
 *
 * O fundo da faixa também: precisa ser transparente. Uma cor sólida fica presa
 * ao valor da criação — o Electron não aplica alfa em `setTitleBarOverlay`
 * depois de a janela existir — e destoa do tema e do escurecimento dos modais,
 * que só o DOM alcança.
 *
 * O teste é de fonte porque os dois lados vivem em processos diferentes.
 */
describe("faixa dos botões nativos", () => {
  const windows = readFileSync("electron/main/windows.js", "utf8");
  const tokens = readFileSync("src/assets/styles/tokens.css", "utf8");
  const overlay = /const TITLEBAR_OVERLAY = \{([^}]*)\}/.exec(windows)?.[1] ?? "";

  it("tem a mesma altura da systembar", () => {
    const daBarra = /--lj-systembar-height:\s*(\d+)px/.exec(tokens)?.[1];
    const daFaixa = /height:\s*(\d+)/.exec(overlay)?.[1];

    expect(daBarra).toBeDefined();
    expect(daFaixa).toBe(daBarra);
  });

  it("tem fundo transparente", () => {
    expect(overlay).toMatch(/color:\s*"#[0-9a-fA-F]{6}00"/);
  });
});

/**
 * No Violin as abas de página saem da barra superior em ambos os caminhos —
 * web já fica sem elas no RibbonBar, e no desktop quem as mostrava era a
 * systembar. Se continuassem aqui, o Shell teria abas num esquema que
 * substituiu tudo por um lançador de ícones.
 */
describe("abas de página da systembar", () => {
  let pinia: Pinia;
  let wrapper: VueWrapper | null;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    $appdata.set("is_desktop", true);
    $userdata.set(KEYS.OPTIONS.UI_STYLE, undefined);
    wrapper = null;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    $appdata.set("is_desktop", undefined);
    $userdata.set(KEYS.OPTIONS.UI_STYLE, undefined);
  });

  it("mostra as abas no clássico e esconde no Violin", async () => {
    wrapper = mount(SystemBar, {
      shallow: true,
      global: { plugins: [pinia, makeI18n("pt")] },
    });
    expect(wrapper.findComponent(RibbonTabs).exists()).toBe(true);

    $userdata.set(KEYS.OPTIONS.UI_STYLE, THEMES.VIOLIN);
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(RibbonTabs).exists()).toBe(false);
  });
});
