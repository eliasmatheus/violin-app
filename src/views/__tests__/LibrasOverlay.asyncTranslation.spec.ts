import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";

const mocks = vi.hoisted(() => ({
  translateText: vi.fn<(text: string) => Promise<string>>(),
  findCachedByText: vi.fn<() => Promise<null>>(async () => null),
  setCached: vi.fn(async () => undefined),
  postMessage: vi.fn(),
}));

vi.mock("@/components/ui", () => ({ LjProgress: { template: "<div />" } }));
vi.mock("@/helpers/Broadcast", () => ({
  default: { listen: vi.fn(() => vi.fn()), send: vi.fn() },
}));
vi.mock("@/helpers/UserData", () => ({
  default: {
    get: (key: string, fallback: unknown) => (key === "modules.libras.show_text" ? true : fallback),
  },
}));
vi.mock("@/helpers/Libras", () => ({
  default: {
    stripHtml: (text: string) => text.replace(/<[^>]*>/g, " ").trim(),
    formatGloss: (gloss: string) => gloss,
    findCachedByText: mocks.findCachedByText,
    translateText: mocks.translateText,
    uniqueTokens: (gloss: string) => gloss.split(" "),
    setCached: mocks.setCached,
  },
}));
vi.mock("@/modules/libras/composables/useLibrasState", () => ({
  useLibrasState: () => ({ scopeEnabled: () => true }),
}));

import LibrasOverlay from "@/views/LibrasOverlay.vue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("LibrasOverlay async translation", () => {
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.translateText.mockReset();
    mocks.findCachedByText.mockReset().mockResolvedValue(null);
    mocks.setCached.mockReset().mockResolvedValue(undefined);
    mocks.postMessage.mockReset();
  });

  it("ignores an older verse translation that resolves after the current verse", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    const first = deferred<string>();
    const second = deferred<string>();
    mocks.translateText.mockImplementation((text) =>
      text === "Primeiro verso" ? first.promise : second.promise
    );

    wrapper = mount(LibrasOverlay, {
      attachTo: document.body,
      props: { type: "bible", verseText: "", bibleVersion: "NVI", bibleBookId: 43, bibleChapter: 3, bibleVerses: [16] },
    });
    const iframe = document.querySelector("iframe.libras-unity-iframe") as HTMLIFrameElement;
    vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(mocks.postMessage);
    await wrapper.setProps({ verseText: "Primeiro verso" });
    await vi.waitFor(() => expect(mocks.translateText).toHaveBeenCalledWith("Primeiro verso", expect.objectContaining({
      operation: "live_bible", part: "verse", bibleVersion: "NVI", bibleBookId: 43, bibleChapter: 3, bibleVerses: [16],
    })));
    await wrapper.setProps({ verseText: "Segundo verso", bibleVerses: [17] });
    await vi.waitFor(() => expect(mocks.translateText).toHaveBeenCalledWith("Segundo verso", expect.objectContaining({
      bibleVersion: "NVI", bibleBookId: 43, bibleChapter: 3, bibleVerses: [17],
    })));
    iframe.dispatchEvent(new Event("load"));
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: { type: "unity_event", event: "on_load_player" },
      })
    );

    second.resolve("GLOSS SEGUNDO");
    await vi.waitFor(() => expect(document.body.textContent).toContain("GLOSS SEGUNDO"));
    await flushPromises();
    first.resolve("GLOSS PRIMEIRO");
    await flushPromises();
    await nextTick();

    expect(mocks.translateText).toHaveBeenCalledTimes(2);
    expect(mocks.setCached).toHaveBeenCalledOnce();
    expect(mocks.setCached).toHaveBeenCalledWith(
      expect.objectContaining({ gloss: "GLOSS SEGUNDO" })
    );
    expect(document.body.textContent).toContain("GLOSS SEGUNDO");
    expect(document.body.textContent).not.toContain("GLOSS PRIMEIRO");
    const playedGlosses = mocks.postMessage.mock.calls
      .map(([message]) => message as { method?: string; params?: string })
      .filter((message) => message.method === "playNow")
      .map((message) => message.params);
    expect(playedGlosses).toEqual(["GLOSS SEGUNDO"]);
  });

  it("keeps the input references captured before an asynchronous cache lookup", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    const cached = deferred<null>();
    mocks.findCachedByText.mockReturnValue(cached.promise);
    mocks.translateText.mockResolvedValue("GLOSS");
    const originalVerses = [16];
    wrapper = mount(LibrasOverlay, {
      attachTo: document.body,
      props: { type: "bible", verseText: "", bibleVersion: "NVI", bibleBookId: 43,
        bibleChapter: 3, bibleVerses: originalVerses },
    });
    await wrapper.setProps({ verseText: "Texto original" });
    await vi.waitFor(() => expect(mocks.findCachedByText).toHaveBeenCalledOnce());
    originalVerses[0] = 17;
    await wrapper.setProps({ bibleVersion: "ARA", bibleChapter: 4, bibleVerses: [1] });
    cached.resolve(null);
    await vi.waitFor(() => expect(mocks.translateText).toHaveBeenCalledOnce());
    expect(mocks.translateText).toHaveBeenCalledWith("Texto original", expect.objectContaining({
      operation: "live_bible", bibleVersion: "NVI", bibleBookId: 43, bibleChapter: 3, bibleVerses: [16],
    }));
  });
});
