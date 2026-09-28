import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import AudioLibrary from "@/helpers/AudioLibrary";
import Platform from "@/helpers/Platform";
import Path from "@/helpers/Path";
import { API_URL_FILES } from "@/config/Api";
import MediaIndex from "../Index.vue";

vi.mock("@/helpers/Platform", () => ({ default: { isDesktop: true } }));
vi.mock("@/helpers/IndexedDB", () => ({ default: {} }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/composables/useViewport", () => ({ useViewport: () => ({ width: 800 }) }));
vi.mock("@/helpers/Modules", () => ({
  default: { get: () => ({ show: true, loading: false, config: {} }) },
}));
vi.mock("@/helpers/AppData", () => ({ default: { get: () => false } }));
vi.mock("@/helpers/UserData", () => ({ default: { get: () => false, set: vi.fn() } }));
vi.mock("@/composables/useFileProjection", () => ({
  useFileProjection: () => ({ isProjecting: { value: false } }),
}));
vi.mock("@/composables/useAudioPlayback", () => ({ useAudioPlayback: () => ({}) }));
vi.mock("@/helpers/Http", () => ({ fetchWithTimeout: vi.fn(), NET_TIMEOUT: {} }));
vi.mock("@/helpers/Telemetry", () => ({ default: { log: vi.fn() } }));
vi.mock("@/composables/useMedia", async () => {
  const { reactive } = await import("vue");
  const state = reactive({
    config: { title: "Custom song", slide_index: 0, audio: "", image: "" },
    slides: [] as Array<{ lyric: string; cover: boolean; url_image: string }>,
  });
  return {
    __state: state,
    default: {
      config: () => state.config,
      slides: () => state.slides,
      slide: () => state.slides[0],
      fullscreen: vi.fn(),
    },
  };
});
vi.mock("@/components/Window.vue", () => ({
  default: {
    props: ["image"],
    template: '<section class="media-window" :data-image="image"><slot /></section>',
  },
}));
vi.mock("vue-fullscreen", () => ({ component: { template: "<div><slot /></div>" } }));
vi.mock("@/components/Slide.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/Player.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/FullscreenPlayer.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/components/ui", () => {
  const stub = { template: "<span><slot /></span>" };
  return {
    LjButton: stub,
    LjChip: stub,
    LjDivider: stub,
    LjPopover: stub,
    LjProgress: stub,
    LjSwitch: stub,
    LjTooltip: stub,
  };
});

const { __state: state } = (await import("@/composables/useMedia")) as unknown as {
  __state: {
    config: { title: string; slide_index: number; audio: string; image: string };
    slides: Array<{ lyric: string; cover: boolean; url_image: string }>;
  };
};
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
let wrapper: VueWrapper | undefined;

beforeEach(() => {
  Platform.isDesktop = true;
  state.config.image = "";
  state.slides = [];
  createObjectURL.mockReset();
  revokeObjectURL.mockReset();
  class ObjectUrl extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal("URL", ObjectUrl);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  AudioLibrary.clearSession();
  vi.unstubAllGlobals();
});

function renderImage(url: string, header = true) {
  state.config.image = header ? url : "";
  state.slides = [{ lyric: "Capa", cover: true, url_image: url }];
  wrapper = mount(MediaIndex);
  return wrapper;
}

describe("Media preview image sources", () => {
  it.each([
    { desktop: true, url: "blob:louvorja://app/13f51649-e8f8-45df-9057-e9ac579526cd" },
    { desktop: false, url: "blob:https://louvorja.com.br/13f51649-e8f8-45df-9057-e9ac579526cd" },
  ])("renders library object URLs unchanged on desktop=$desktop", async ({ desktop, url }) => {
    Platform.isDesktop = desktop;
    createObjectURL.mockReturnValue(url);
    const token = AudioLibrary.setSessionImage(
      "cover.png",
      new Blob(["image"], { type: "image/png" })
    );
    const image = await AudioLibrary.resolveImage(token);
    expect(image).toBe(url);

    const preview = renderImage(image!, false);

    expect(preview.get(".media-preload").attributes("src")).toBe(url);
    state.config.image = image!;
    await nextTick();
    expect(preview.get(".media-window").attributes("data-image")).toBe(url);
    preview.unmount();
    wrapper = undefined;
    expect(revokeObjectURL).not.toHaveBeenCalled();
    AudioLibrary.clearSession();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(url);
  });

  it.each([
    { desktop: true, input: "images/cover.jpg", expected: "louvorja://files/images/cover.jpg" },
    { desktop: false, input: "images/cover.jpg", expected: `${API_URL_FILES}/images/cover.jpg` },
    {
      desktop: true,
      input: "https://cdn.louvorja.com/images/cover.jpg",
      expected:
        "louvorja://files/images/cover.jpg?source=https%3A%2F%2Fcdn.louvorja.com%2Fimages%2Fcover.jpg",
    },
    {
      desktop: false,
      input: "https://cdn.louvorja.com/images/cover.jpg",
      expected: "https://cdn.louvorja.com/images/cover.jpg",
    },
  ])(
    "keeps media path resolution on desktop=$desktop for $input",
    ({ desktop, input, expected }) => {
      Platform.isDesktop = desktop;
      const preview = renderImage(input);
      expect(preview.get(".media-preload").attributes("src")).toBe(expected);
      expect(preview.get(".media-window").attributes("data-image")).toBe(expected);
    }
  );

  it("keeps Path.file validation strict for non-file sources", () => {
    expect(() => Path.file("blob:louvorja://app/id")).toThrow(/caminho inválido/);
    expect(() => Path.file("../private/image.jpg")).toThrow(/caminho inválido/);
    expect(() => Path.file("javascript:alert(1)")).toThrow(/caminho inválido/);
  });
});
