import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { createI18n } from "vue-i18n";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { KEYS } from "@/constants/UserDataKeys";

const mocks = vi.hoisted(() => ({
  listeners: new Set<(_message: { type: string; payload: unknown }) => void>(),
}));
vi.mock("@/composables/useProjectionCloseNotice", () => ({
  useProjectionCloseNotice: vi.fn(),
}));
vi.mock("@/helpers/Broadcast", () => ({
  default: {
    listen: (callback: (_message: { type: string; payload: unknown }) => void) => {
      mocks.listeners.add(callback);
      return () => mocks.listeners.delete(callback);
    },
    send: (type: string, payload: unknown) => {
      for (const listener of mocks.listeners) listener({ type, payload });
    },
  },
}));

import Broadcast from "@/helpers/Broadcast";
import FileProjection from "@/views/FileProjection.vue";
import { useUserDataStore } from "@/stores/userDataStore";

const KEY_TYPE = KEYS.MODULES.MEDIA_LIBRARY.TRANSITION_TYPE;
const OPT = KEYS.MODULES.MEDIA_LIBRARY.TRANSITION_OPTIONS.ROOT;

const i18n = createI18n({
  legacy: false,
  locale: "pt",
  messages: {
    pt: {
      projection: {
        video_unavailable: "Vídeo indisponível",
        video_unavailable_hint: "Tente novamente",
      },
    },
  },
});

let epoch = 0;

/** Ativa uma mídia na projeção — o gate exige stage_epoch crescente. */
function activate(p: {
  url: string;
  type: "image" | "video" | "pdf" | "youtube";
  backward?: boolean;
}): void {
  Broadcast.send(BROADCAST_TYPE.FILE_PROJECTION, {
    stage_epoch: ++epoch,
    title: "midia",
    ...p,
  });
}

describe("FileProjection transitions", () => {
  let wrapper: VueWrapper | null = null;

  function setOption(path: string, value: unknown): void {
    useUserDataStore().SET_PATH({ path, value });
  }

  function montar(): VueWrapper {
    wrapper = mount(FileProjection, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
        stubs: { OverlayRenderer: true, Transition: false },
      },
    });
    return wrapper;
  }

  function stageStyle(): string {
    return wrapper!.find(".lj-tstage").attributes("style") ?? "";
  }

  beforeEach(() => {
    setActivePinia(createPinia());
    epoch = 0;
    // O localStorage do ambiente de teste é um objeto pelado, sem os métodos.
    const guardado = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => void guardado.set(k, v),
      removeItem: (k: string) => void guardado.delete(k),
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    mocks.listeners.clear();
  });

  it("swaps instantly with the default (none) effect, both medias coexisting", async () => {
    const w = montar();
    activate({ url: "https://a.test/1.jpg", type: "image" });
    await nextTick();
    expect(w.find(".file-projection__media").attributes("src")).toBe("https://a.test/1.jpg");

    activate({ url: "https://a.test/2.jpg", type: "image" });
    await nextTick();

    expect(w.find(".lj-t-none-enter-active").exists()).toBe(true);
    expect(w.find(".lj-t-none-leave-active").exists()).toBe(true);
    expect(w.findAll(".file-projection__media")).toHaveLength(2);
  });

  it("applies the configured media-library effect while a media changes", async () => {
    setOption(KEY_TYPE, "fade");
    const w = montar();
    activate({ url: "https://a.test/1.jpg", type: "image" });
    await nextTick();

    activate({ url: "https://a.test/2.jpg", type: "image" });
    await nextTick();

    expect(w.find(".lj-t-fade-enter-active").exists()).toBe(true);
    expect(w.find(".lj-t-fade-leave-active").exists()).toBe(true);
    expect(stageStyle()).toContain("--trans-dur: 500ms");
  });

  it("exposes the configured duration and timing function on the stage", async () => {
    setOption(KEY_TYPE, "slide");
    setOption(KEYS.MODULES.MEDIA_LIBRARY.TRANSITION_DURATION, 700);
    setOption(`${OPT}.ease`, "ease-in");
    montar();
    activate({ url: "https://a.test/1.jpg", type: "image" });
    await nextTick();

    expect(stageStyle()).toContain("--trans-dur: 700ms");
    expect(stageStyle()).toContain("--trans-ease: ease-in");
  });

  it("inverts the automatic direction when the navigation came from 'previous'", async () => {
    setOption(KEY_TYPE, "slide");
    montar();
    activate({ url: "https://a.test/1.jpg", type: "image" });
    await nextTick();
    expect(stageStyle()).toContain("--ent-x: 100%");

    activate({ url: "https://a.test/2.jpg", type: "image", backward: true });
    await nextTick();

    expect(stageStyle()).toContain("--ent-x: -100%");
    expect(stageStyle()).toContain("--lv-x: 100%");
  });

  it("rejects the whole activation at the boundary when backward is not a boolean", async () => {
    montar();
    activate({ url: "https://a.test/1.jpg", type: "image" });
    await nextTick();

    activate({
      url: "https://a.test/2.jpg",
      type: "image",
      backward: "sim" as unknown as boolean,
    });
    await nextTick();

    // O gate derruba o payload inválido: a projeção continua na mídia anterior.
    expect(wrapper!.find(".file-projection__media").attributes("src")).toBe(
      "https://a.test/1.jpg",
    );
    expect(wrapper!.findAll(".file-projection__media")).toHaveLength(1);
  });

  it("animates PDF swaps too — the canvas is part of the media identity", async () => {
    setOption(KEY_TYPE, "fade");
    const w = montar();
    activate({ url: "https://a.test/doc.pdf", type: "pdf" });
    await nextTick();

    activate({ url: "https://a.test/other.pdf", type: "pdf" });
    await nextTick();

    expect(w.findAll("canvas")).toHaveLength(2);
    expect(w.find(".lj-t-fade-enter-active").exists()).toBe(true);
    expect(w.find(".lj-t-fade-leave-active").exists()).toBe(true);
  });

  it("does not re-animate when the same media is activated again", async () => {
    setOption(KEY_TYPE, "fade");
    const w = montar();
    activate({ url: "https://a.test/1.jpg", type: "image" });
    await nextTick();

    activate({ url: "https://a.test/1.jpg", type: "image" });
    await nextTick();

    expect(w.find(".lj-t-fade-enter-active").exists()).toBe(false);
    expect(w.findAll(".file-projection__media")).toHaveLength(1);
  });
});
