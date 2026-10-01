import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, type ComponentCustomProperties } from "vue";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import CustomSongs from "@/helpers/CustomSongs";
import SlideEditor from "../Index.vue";
import pt from "../../lang/pt.json";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (_payload: unknown) => void>(),
}));

vi.mock("@/composables/useBroadcastListener", () => ({
  useBroadcastListener: (type: string, handler: (_payload: unknown) => void) => {
    mocks.listeners.set(type, handler);
  },
}));

vi.mock("@/helpers/AudioLibrary", () => ({
  default: {
    resolveAudio: vi.fn().mockResolvedValue(null),
    clearSession: vi.fn(),
  },
}));

vi.mock("@/helpers/UserData", () => ({ default: { set: vi.fn(), get: vi.fn() } }));

vi.mock("@/composables/useSlideStyle", () => ({
  useSlideStyle: () => ({
    cfg: { value: { font_size_cover: "10px", font_size_lyric: "10px", font_size_aux: "10px" } },
    coverStyle: () => ({}),
    lyricStyle: () => ({}),
    auxStyle: () => ({}),
  }),
}));

function translation(key: string): string {
  return key.split(".").reduce<unknown>((value, part) => {
    if (value && typeof value === "object" && part in value) {
      return (value as Record<string, unknown>)[part];
    }
    return key;
  }, pt) as string;
}

function emitRibbon(action: string) {
  mocks.listeners.get(BROADCAST_TYPE.MODULE_RIBBON_ACTION)?.({ module: "slide_editor", action });
}

describe("slide editor text case actions", () => {
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    mocks.listeners.clear();
    const song = CustomSongs.newSong("Canção original");
    song.slides = [
      CustomSongs.newSlide({ tipo: "CAPA", letra: "Luz e ação\nDeus é bom", letra_aux: "Só Fé" }),
      CustomSongs.newSlide({ letra: "Graça viva", letra_aux: "Amém" }),
    ];
    sessionStorage.setItem("slide_editor_song_v2", JSON.stringify(song));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    sessionStorage.clear();
  });

  async function mountEditor() {
    wrapper = mount(SlideEditor, {
      global: {
        config: {
          globalProperties: { t: (key: string) => key } as unknown as ComponentCustomProperties,
        },
        stubs: {
          ModuleContainer: defineComponent({
            setup(_, { slots, expose }) {
              expose({ tm: translation });
              return () => h("div", [slots.header?.(), slots.default?.()]);
            },
          }),
          LjIcon: true,
          draggable: true,
        },
      },
    });
    await flushPromises();
    return wrapper;
  }

  function textValues(editor: VueWrapper) {
    return editor
      .findAll("textarea")
      .map((textarea) => (textarea.element as HTMLTextAreaElement).value);
  }

  it("converts both text fields on only the current slide", async () => {
    const editor = await mountEditor();
    await editor.find('[aria-label="Converter slide atual para maiúsculas"]').trigger("click");
    expect(textValues(editor)).toEqual(["LUZ E AÇÃO\nDEUS É BOM", "SÓ FÉ"]);
    expect(editor.find(".se-dirty-dot").exists()).toBe(true);

    emitRibbon("next");
    await flushPromises();
    expect(textValues(editor)).toEqual(["Graça viva", "Amém"]);

    await editor.find('[aria-label="Converter slide atual para minúsculas"]').trigger("click");
    expect(textValues(editor)).toEqual(["graça viva", "amém"]);
    emitRibbon("first");
    await flushPromises();
    expect(textValues(editor)).toEqual(["LUZ E AÇÃO\nDEUS É BOM", "SÓ FÉ"]);
  });

  it("converts every slide, including the cover and auxiliary text", async () => {
    const editor = await mountEditor();
    await editor.find('[aria-label="Converter todos os slides para maiúsculas"]').trigger("click");
    expect(textValues(editor)).toEqual(["LUZ E AÇÃO\nDEUS É BOM", "SÓ FÉ"]);
    emitRibbon("next");
    await flushPromises();
    expect(textValues(editor)).toEqual(["GRAÇA VIVA", "AMÉM"]);

    await editor.find('[aria-label="Converter todos os slides para minúsculas"]').trigger("click");
    expect(textValues(editor)).toEqual(["graça viva", "amém"]);
    emitRibbon("first");
    await flushPromises();
    expect(textValues(editor)).toEqual(["luz e ação\ndeus é bom", "só fé"]);
    expect(editor.find(".se-dirty-dot").exists()).toBe(true);
  });
});
