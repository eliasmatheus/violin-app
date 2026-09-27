import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { makeI18n } from "@/components/ui/__tests__/mountUi";
import ptApp from "@/lang/pt.json";
import { setScrollPosition } from "@/helpers/ScrollMemory";
import type { Playlist } from "@/types/Music";
import ptModulo from "../lang/pt.json";

// `usePlaylists` lê Pinia no corpo do módulo, na importação — o pinia precisa
// estar ativo antes dos componentes serem carregados.
setActivePinia(createPinia());
const { default: PlaylistPanel } = await import("../components/PlaylistPanel.vue");
const { default: PlaylistSongs } = await import("../components/PlaylistSongs.vue");

/**
 * Os painéis laterais da música rolam em listas próprias que o `v-if` do slot
 * desmonta ao trocar de playlist/fechar o módulo — mesma perda de `scrollTop`
 * da liturgia. O jsdom não tem layout, então o `scrollTop` ganha dublê.
 */
const i18n = makeI18n("pt");
i18n.global.setLocaleMessage("pt", {
  ...ptApp,
  modules: { ...ptApp.modules, musics: ptModulo },
});

type ScrollerComMemoria = HTMLElement & { __scrollTop?: number };
let originalScrollTop: PropertyDescriptor | undefined;

beforeEach(() => {
  setActivePinia(createPinia());
  setScrollPosition("musics:painel", 0);
  setScrollPosition("musics:faixas", 0);
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

const montados: VueWrapper[] = [];

afterEach(() => {
  while (montados.length) montados.pop()?.unmount();
  if (originalScrollTop) {
    Object.defineProperty(HTMLElement.prototype, "scrollTop", originalScrollTop);
  } else {
    delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
  }
  document.body.innerHTML = "";
});

function montar(component: unknown, options: Record<string, unknown> = {}): VueWrapper {
  const wrapper = mount(component as never, {
    ...options,
    shallow: true,
    global: { plugins: [i18n] },
  }) as VueWrapper;
  montados.push(wrapper);
  return wrapper;
}

function rolar(wrapper: VueWrapper, seletor: string, top: number): void {
  const el = wrapper.find<HTMLElement>(seletor).element as HTMLElement;
  el.scrollTop = top;
  el.dispatchEvent(new Event("scroll"));
}

const PLAYLIST: Playlist = {
  id: "p1",
  name: "Adoração",
  songs: [],
  createdAt: "",
  updatedAt: "",
};

describe("PlaylistPanel — memória de rolagem", () => {
  it("restaura a posição da lista ao remontar", async () => {
    const primeira = montar(PlaylistPanel);
    rolar(primeira, ".playlist-panel-list", 300);
    primeira.unmount();

    const segunda = montar(PlaylistPanel);
    await nextTick();
    expect(segunda.find<HTMLElement>(".playlist-panel-list").element.scrollTop).toBe(300);
  });
});

describe("PlaylistSongs — memória de rolagem", () => {
  it("restaura a posição das faixas ao remontar", async () => {
    const primeira = montar(PlaylistSongs, { props: { playlist: PLAYLIST } });
    rolar(primeira, ".playlist-songs-list", 260);
    primeira.unmount();

    const segunda = montar(PlaylistSongs, { props: { playlist: PLAYLIST } });
    await nextTick();
    expect(segunda.find<HTMLElement>(".playlist-songs-list").element.scrollTop).toBe(260);
  });
});
