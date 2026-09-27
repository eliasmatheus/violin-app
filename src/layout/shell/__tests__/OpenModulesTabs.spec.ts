import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import OpenModulesTabs from "@/layout/shell/OpenModulesTabs.vue";
import $appdata from "@/helpers/AppData";
import $userdata from "@/helpers/UserData";
import { KEYS } from "@/constants/UserDataKeys";
import { THEMES } from "@/config/Theme";
import { makeI18n } from "@/components/ui/__tests__/mountUi";

/**
 * No Violin a barra de abas abertos some: o destaque de "o que está aberto"
 * migra para o lançador de ícones (ModuleLauncher). Aqui se protege o gate —
 * se a barra continuasse renderizando, o Violin teria as abas E os ícones
 * destacados, duplicando a mesma informação.
 */
describe("OpenModulesTabs", () => {
  let pinia: Pinia;
  let montados: VueWrapper[];

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    $appdata.set("modules", {});
    $userdata.set(KEYS.OPTIONS.UI_STYLE, undefined);
    montados = [];
  });

  afterEach(() => {
    while (montados.length) montados.pop()?.unmount();
    $appdata.set("modules", {});
    $userdata.set(KEYS.OPTIONS.UI_STYLE, undefined);
  });

  function montar(): VueWrapper {
    const wrapper = mount(OpenModulesTabs, {
      shallow: true,
      global: { plugins: [pinia, makeI18n("pt")] },
    });
    montados.push(wrapper);
    return wrapper;
  }

  it("aparece no clássico com módulo aberto e some ao trocar para Violin", async () => {
    $appdata.set("modules", { bible: { show: true } });
    const wrapper = montar();
    expect(wrapper.find(".subtabs-wrapper").exists()).toBe(true);

    $userdata.set(KEYS.OPTIONS.UI_STYLE, THEMES.VIOLIN);
    await nextTick();
    expect(wrapper.find(".subtabs-wrapper").exists()).toBe(false);
  });

  it("continua escondida no clássico quando nenhum módulo está aberto", () => {
    const wrapper = montar();
    expect(wrapper.find(".subtabs-wrapper").exists()).toBe(false);
  });
});
