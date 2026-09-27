import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import RibbonContextualStrip from "@/layout/shell/RibbonContextualStrip.vue";
import RibbonPageBody from "@/layout/shell/RibbonPageBody.vue";
import $userdata from "@/helpers/UserData";
import { KEYS } from "@/constants/UserDataKeys";
import { THEMES } from "@/config/Theme";
import { makeI18n } from "@/components/ui/__tests__/mountUi";

/**
 * A faixa é o menu contextual do esquema Violin e é montada por quem tem o
 * template do módulo: o ModuleContainer para a maioria, o próprio módulo
 * quando não passa pelo container (liturgia). Por isso o gate do esquema
 * mora DENTRO da faixa — se ela renderizasse no clássico, o contexto
 * apareceria em dobro (aba da ribbon + faixa); se deixasse de renderizar no
 * Violin, módulos como a liturgia ficariam sem menu nenhum.
 */
describe("RibbonContextualStrip", () => {
  let pinia: Pinia;
  let montados: VueWrapper[];

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    $userdata.set(KEYS.OPTIONS.UI_STYLE, undefined);
    montados = [];
  });

  afterEach(() => {
    while (montados.length) montados.pop()?.unmount();
    $userdata.set(KEYS.OPTIONS.UI_STYLE, undefined);
  });

  function montar(moduleId: string): VueWrapper {
    const wrapper = mount(RibbonContextualStrip, {
      props: { moduleId },
      shallow: true,
      global: { plugins: [pinia, makeI18n("pt")] },
    });
    montados.push(wrapper);
    return wrapper;
  }

  it("não renderiza no esquema clássico (mesmo com contexto disponível)", async () => {
    const wrapper = montar("liturgy");
    expect(wrapper.find(".ctx-strip").exists()).toBe(false);

    $userdata.set(KEYS.OPTIONS.UI_STYLE, THEMES.VIOLIN);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".ctx-strip").exists()).toBe(true);
  });

  it("renderiza no Violin para módulo com página contextual", () => {
    $userdata.set(KEYS.OPTIONS.UI_STYLE, THEMES.VIOLIN);
    const wrapper = montar("liturgy");

    expect(wrapper.find(".ctx-strip").exists()).toBe(true);
    expect(wrapper.findComponent(RibbonPageBody).exists()).toBe(true);
  });

  it("fica oculta no Violin quando o módulo não tem contexto", () => {
    $userdata.set(KEYS.OPTIONS.UI_STYLE, THEMES.VIOLIN);
    const wrapper = montar("album");

    expect(wrapper.find(".ctx-strip").exists()).toBe(false);
  });
});
