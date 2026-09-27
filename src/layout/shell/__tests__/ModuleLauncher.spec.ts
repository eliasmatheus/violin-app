import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import ModuleLauncher from "@/layout/shell/ModuleLauncher.vue";
import $appdata from "@/helpers/AppData";
import $userdata from "@/helpers/UserData";
import $modules from "@/helpers/Modules";
import { moduleShowInMainMenu } from "@/constants/UserDataKeys";
import { makeI18n } from "@/components/ui/__tests__/mountUi";

/**
 * No Violin o Shell não tem mais abas de página: o lançador é a ribbon
 * inteira achatada em uma linha — mesma ordem e mesmo filtro de visibilidade,
 * só clique (o fechar fica com a barra de módulos abertos).
 */
describe("ModuleLauncher", () => {
  let pinia: Pinia;
  let montados: VueWrapper[];

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    $appdata.set("active_module", null);
    $appdata.set("modules", {});
    $userdata.set(moduleShowInMainMenu("liturgy"), undefined);
    montados = [];
  });

  afterEach(() => {
    while (montados.length) montados.pop()?.unmount();
    document.body.innerHTML = "";
    $appdata.set("active_module", null);
    $appdata.set("modules", {});
    $userdata.set(moduleShowInMainMenu("liturgy"), undefined);
    vi.restoreAllMocks();
  });

  function montar(opts: { shallow?: boolean } = {}): VueWrapper {
    const wrapper = mount(ModuleLauncher, {
      // O menu vive num Teleport, e o shallow do VTU o stuba — os testes de
      // menu pedem mount completo; os demais dispensam o custo.
      shallow: opts.shallow ?? true,
      global: { plugins: [pinia, makeI18n("pt")] },
    });
    montados.push(wrapper);
    return wrapper;
  }

  it("lista todos os módulos visíveis da ribbon", () => {
    const wrapper = montar();
    const itens = wrapper.findAll(".launcher-item");

    expect(itens.length).toBeGreaterThan(15);
    expect(wrapper.find('[data-testid="launcher-liturgy"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="launcher-bible"]').exists()).toBe(true);
  });

  it("esconde do lançador o módulo que o operador ocultou da ribbon", async () => {
    $userdata.set(moduleShowInMainMenu("liturgy"), false);
    const wrapper = montar();

    expect(wrapper.find('[data-testid="launcher-liturgy"]').exists()).toBe(false);

    $userdata.set(moduleShowInMainMenu("liturgy"), true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="launcher-liturgy"]').exists()).toBe(true);
  });

  it("clique abre o módulo", async () => {
    const abrir = vi.spyOn($modules, "open");
    const wrapper = montar();

    await wrapper.find('[data-testid="launcher-bible"]').trigger("click");

    expect(abrir).toHaveBeenCalledWith("bible");
  });

  it("destaca apenas o módulo ativo", async () => {
    const wrapper = montar();

    $appdata.set("active_module", "liturgy");
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="launcher-liturgy"]').classes()).toContain(
      "launcher-item--active"
    );
    expect(wrapper.find('[data-testid="launcher-bible"]').classes()).not.toContain(
      "launcher-item--active"
    );
  });

  it("distingue aberto de na-tela com destaques diferentes", async () => {
    $appdata.set("modules", { bible: { show: true }, liturgy: { show: true } });
    $appdata.set("active_module", "bible");
    const wrapper = montar();

    const naTela = wrapper.find('[data-testid="launcher-bible"]');
    const aberto = wrapper.find('[data-testid="launcher-liturgy"]');
    const fechado = wrapper.find('[data-testid="launcher-clock"]');

    expect(fechado.exists()).toBe(true);
    expect(naTela.classes()).toContain("launcher-item--open");
    expect(naTela.classes()).toContain("launcher-item--active");
    expect(aberto.classes()).toContain("launcher-item--open");
    expect(aberto.classes()).not.toContain("launcher-item--active");
    expect(fechado.classes()).not.toContain("launcher-item--open");
    expect(fechado.classes()).not.toContain("launcher-item--active");
  });

  it("botão direito em módulo aberto oferece Fechar e fecha", async () => {
    $appdata.set("modules", { bible: { show: true } });
    const fechar = vi.spyOn($modules, "close");
    const wrapper = montar({ shallow: false });

    await wrapper.find('[data-testid="launcher-bible"]').trigger("contextmenu");
    const item = document.body.querySelector('[data-testid="launcher-close-bible"]');
    expect(item).not.toBeNull();

    (item as HTMLElement).click();
    expect(fechar).toHaveBeenCalledWith("bible");
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector(".launcher-menu")).toBeNull();
  });

  it("botão direito em módulo fechado não abre menu", async () => {
    const wrapper = montar({ shallow: false });

    await wrapper.find('[data-testid="launcher-bible"]').trigger("contextmenu");

    expect(document.body.querySelector(".launcher-menu")).toBeNull();
  });

  it("é só clique: nenhum item traz botão de fechar", () => {
    const wrapper = montar();

    for (const item of wrapper.findAll(".launcher-item")) {
      expect(item.findAll("button").length).toBe(0);
    }
  });
});
