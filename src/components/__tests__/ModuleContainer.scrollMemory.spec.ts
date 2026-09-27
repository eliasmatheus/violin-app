import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import { makeI18n } from "@/components/ui/__tests__/mountUi";
import { createPinia, setActivePinia } from "pinia";
import AppData from "@/helpers/AppData";
import { setScrollPosition, getScrollPosition } from "@/helpers/ScrollMemory";
import ModuleContainer from "../ModuleContainer.vue";

/**
 * O `<main>` embedded é o scroller do hinário, do hinário 1996, da música e de
 * todos os demais módulos embedded: a posição precisa sobreviver à troca de
 * módulo (o KeepAlive destaca o nó e o browser zera o offset) e à evicção do
 * cache. O jsdom não tem layout, então as três métricas ganham dublê — o setter
 * de `scrollTop` ainda emula o clamp browser de não passar do fim do conteúdo.
 */
const CHAVE = "container:testmod";
const i18n = makeI18n("pt");

type ElementoComMemoria = HTMLElement & {
  __scrollTop?: number;
  __clientHeight?: number;
  __scrollHeight?: number;
};
type ChaveMetrica = "__scrollTop" | "__clientHeight" | "__scrollHeight";

const metricas: Array<[string, PropertyDescriptor | undefined]> = [];

function definirMetrica(
  nome: "scrollTop" | "clientHeight" | "scrollHeight",
  padrao: number,
  clamp = false
): void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, nome);
  metricas.push([nome, original]);
  const chave = `__${nome}` as ChaveMetrica;
  Object.defineProperty(HTMLElement.prototype, nome, {
    configurable: true,
    get() {
      const el = this as ElementoComMemoria;
      const valor = el[chave];
      return typeof valor === "number" ? valor : padrao;
    },
    set(value: number) {
      const el = this as ElementoComMemoria;
      if (!clamp) {
        el[chave] = value;
        return;
      }
      // Pela propriedade (getter com default), não pelo expando cru.
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.__scrollTop = Math.min(Math.max(value, 0), max);
    },
  });
}

const montados: VueWrapper[] = [];

beforeEach(() => {
  setActivePinia(createPinia());
  setScrollPosition(CHAVE, 0);
  AppData.set("modules.testmod.show", true);
  definirMetrica("scrollTop", 0, true);
  definirMetrica("clientHeight", 800);
  definirMetrica("scrollHeight", 2000);
});

afterEach(() => {
  while (montados.length) montados.pop()?.unmount();
  for (const [nome, original] of metricas.splice(0)) {
    if (original) Object.defineProperty(HTMLElement.prototype, nome, original);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[nome];
  }
  document.body.innerHTML = "";
});

function montar(): VueWrapper {
  const wrapper = mount(ModuleContainer, {
    props: { manifest: { id: "testmod", name: "Teste" }, title: "Teste" },
    slots: { default: '<div class="conteudo">lista de hinos</div>' },
    global: { plugins: [i18n] },
  });
  montados.push(wrapper);
  return wrapper;
}

function scroller(wrapper: VueWrapper): HTMLElement {
  return wrapper.find<HTMLElement>(".module-embedded-content").element as HTMLElement;
}

function rolar(el: HTMLElement, top: number): void {
  el.scrollTop = top;
  el.dispatchEvent(new Event("scroll"));
}

describe("ModuleContainer — memória de rolagem do <main>", () => {
  it("restaura a posição salva ao remontar (volta do outro módulo)", async () => {
    const primeira = montar();
    await nextTick();
    rolar(scroller(primeira), 420);
    primeira.unmount();

    const segunda = montar();
    await nextTick();
    expect(scroller(segunda).scrollTop).toBe(420);
  });

  it("aborta a restauração quando o conteúdo não cresce e volta a salvar", async () => {
    // Alvo acima do fim do conteúdo (max = 2000 - 800 = 1200).
    setScrollPosition(CHAVE, 5000);

    const wrapper = montar();
    await nextTick();
    const el = scroller(wrapper);
    // Tentativa aplicada e clamped pelo conteúdo, mas a memória não pode ser
    // sobrescrita no caminho.
    expect(el.scrollTop).toBe(1200);
    expect(getScrollPosition(CHAVE)).toBe(5000);

    // Segunda passada sem crescimento de scrollHeight: pendente é descartada.
    el.dispatchEvent(new Event("scroll"));
    expect(getScrollPosition(CHAVE)).toBe(5000);

    // Com o pendente fora, a rolagem volta a ser salva normalmente.
    el.dispatchEvent(new Event("scroll"));
    expect(getScrollPosition(CHAVE)).toBe(1200);
  });

  it("sem posição salva, a primeira montagem fica no topo", async () => {
    const wrapper = montar();
    await nextTick();
    expect(scroller(wrapper).scrollTop).toBe(0);
  });
});
