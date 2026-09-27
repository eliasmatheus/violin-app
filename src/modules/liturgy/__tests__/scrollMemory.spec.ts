import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import { makeI18n } from "@/components/ui/__tests__/mountUi";
import ptApp from "@/lang/pt.json";
import { LiturgyItemTypeEnum } from "@/enums/LiturgyItemTypeEnum";
import type { LiturgyItem } from "@/types/Liturgy";
import LiturgyNotesPanel from "../components/LiturgyNotesPanel.vue";
import LiturgyTimeline from "../components/LiturgyTimeline.vue";
import ptModulo from "../lang/pt.json";
import { setScrollPosition } from "@/helpers/ScrollMemory";

/**
 * A rolagem da liturgia precisa sobreviver à troca de módulo: a subárvore é
 * desmontada pelo `v-if` de `isActive` em Index.vue e remontada ao voltar. O
 * jsdom não tem layout, então o `scrollTop` ganha um dublê com get/set próprio
 * e a memória do componente é exercitada montando, rolando e remontando.
 */
const i18n = makeI18n("pt");
// As chaves do módulo só entram na instância única em runtime (ModuleManager);
// aqui elas são fundidas de uma vez para o `t` resolver de verdade.
i18n.global.setLocaleMessage("pt", {
  ...ptApp,
  modules: { ...ptApp.modules, liturgy: ptModulo },
});
let originalScrollTop: PropertyDescriptor | undefined;

type ScrollerComMemoria = HTMLElement & { __scrollTop?: number };

beforeEach(() => {
  setScrollPosition("liturgy:timeline", 0);
  setScrollPosition("liturgy:notas", 0);
  originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop");
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get() {
      return (this as ScrollerComMemoria).__scrollTop ?? 0;
    },
    set(value: number) {
      (this as ScrollerComMemoria).__scrollTop = value;
    },
  });
});

afterEach(() => {
  if (originalScrollTop) {
    Object.defineProperty(HTMLElement.prototype, "scrollTop", originalScrollTop);
  } else {
    delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
  }
});

const montados: VueWrapper[] = [];

afterEach(() => {
  while (montados.length) montados.pop()?.unmount();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function montar(component: any, options: any = {}): VueWrapper {
  const wrapper = mount(component, { ...options, global: { plugins: [i18n] } }) as VueWrapper;
  montados.push(wrapper);
  return wrapper;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function rolar(el: HTMLElement, top: number) {
  el.scrollTop = top;
  el.dispatchEvent(new Event("scroll"));
}

function item(id: string): LiturgyItem {
  return {
    id,
    tipo: LiturgyItemTypeEnum.MUSICA,
    subtipo: "",
    musica: 0,
    item: "Item da liturgia",
    subitem: "",
    cor: "#00004F",
    duration: 0,
    dir: "",
    dir_info: "",
    url: "",
    escolha: false,
    has_instrumental_music: false,
  };
}

const PROPS_TIMELINE = {
  isChecked: () => false,
  subtitleFor: () => "",
  onReorder: () => {},
  openItemDialog: () => {},
  cloneItem: () => {},
  confirmRemove: () => {},
  executeItem: () => {},
  playMusic: () => {},
  openLyric: () => {},
  changeColor: () => {},
  toggleChecked: () => {},
};

function montarTimeline(items: LiturgyItem[]): VueWrapper {
  return montar(LiturgyTimeline, { shallow: true, props: { items, ...PROPS_TIMELINE } });
}

describe("LiturgyTimeline — memória de rolagem", () => {
  it("sem itens não renderiza o scroller e não quebra", () => {
    const wrapper = montarTimeline([]);
    expect(wrapper.find(".liturgy-tl-scroll").exists()).toBe(false);
  });

  it("restaura a posição ao remontar (volta do outro módulo)", async () => {
    const primeira = montarTimeline([item("a"), item("b")]);
    rolar(primeira.find<HTMLElement>(".liturgy-tl-scroll").element as HTMLElement, 420);
    primeira.unmount();

    const segunda = montarTimeline([item("a"), item("b")]);
    await nextTick();
    expect(segunda.find<HTMLElement>(".liturgy-tl-scroll").element.scrollTop).toBe(420);
  });

  it("guarda sempre a última rolagem, não a primeira", async () => {
    const primeira = montarTimeline([item("a"), item("b")]);
    const el = primeira.find<HTMLElement>(".liturgy-tl-scroll").element as HTMLElement;
    rolar(el, 100);
    rolar(el, 250);
    primeira.unmount();

    const segunda = montarTimeline([item("a"), item("b")]);
    await nextTick();
    expect(segunda.find<HTMLElement>(".liturgy-tl-scroll").element.scrollTop).toBe(250);
  });
});

describe("LiturgyNotesPanel — memória de rolagem", () => {
  it("restaura a posição do editor ao remontar", async () => {
    const props = { onInput: () => {} };

    const primeira = montar(LiturgyNotesPanel, { shallow: true, props });
    rolar(primeira.find<HTMLElement>(".lit-notes-area").element as HTMLElement, 300);
    primeira.unmount();

    const segunda = montar(LiturgyNotesPanel, { shallow: true, props });
    await nextTick();
    expect(segunda.find<HTMLElement>(".lit-notes-area").element.scrollTop).toBe(300);
  });
});
