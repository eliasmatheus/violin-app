import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import BibleSpotlight from "@/components/BibleSpotlight.vue";
import RemoteBible from "../RemoteBible.vue";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { KEYS } from "@/constants/UserDataKeys";

const mocks = vi.hoisted(() => ({
  databaseGet: vi.fn(),
  apiFetch: vi.fn(),
  postApi: vi.fn(),
  userDataSet: vi.fn(),
  modulesOpen: vi.fn(),
  openBibleWindow: vi.fn(),
  broadcastSend: vi.fn(),
}));
vi.mock("@/helpers/Database", () => ({ default: { get: mocks.databaseGet } }));
vi.mock("@/helpers/AppData", () => ({ default: { get: () => 1 } }));
vi.mock("@/helpers/UserData", () => ({
  default: { get: () => 1, set: mocks.userDataSet },
}));
vi.mock("@/helpers/Modules", () => ({ default: { open: mocks.modulesOpen } }));
vi.mock("@/helpers/ProjectionWindows", () => ({
  default: { openBibleWindow: mocks.openBibleWindow },
}));
vi.mock("@/helpers/Broadcast", () => ({ default: { send: mocks.broadcastSend } }));
vi.mock("@/helpers/ApiClient", () => ({
  apiFetch: mocks.apiFetch,
  postApi: mocks.postApi,
}));

const books = [{ id_bible_book: 65, name: "Judas", abbreviation: "Jd", chapters: 1 }];
const chapter = { "1": "Texto do versículo" };
const expectedResult = {
  id_bible_book: 65,
  id_bible_version: 1,
  book: "Judas",
  chapter: 1,
  verse: 1,
  reference: "Judas 1:1",
  text: chapter["1"],
};
const slot = { template: "<div><slot /></div>" };
const global = {
  plugins: [
    createI18n({
      legacy: false,
      locale: "pt",
      messages: { pt: {} },
      missingWarn: false,
      fallbackWarn: false,
    }),
  ],
  stubs: {
    BibleSpotlight: false,
    DialogRoot: slot,
    DialogPortal: slot,
    DialogContent: slot,
    DialogOverlay: true,
    DialogTitle: true,
    VisuallyHidden: true,
    LjButton: { template: "<button><slot /></button>" },
  },
};

async function chooseVerse(wrapper: VueWrapper) {
  const input = wrapper.get(".quicknav-hidden-input");
  await input.trigger("keydown", { key: "j" });
  await input.trigger("keydown", { key: "1" });
  await flushPromises();
  await input.trigger("keydown", { key: "1" });
  await input.trigger("keydown", { key: "Enter" });
  await flushPromises();
}

describe("BibleSpotlight em seus hosts", () => {
  let wrapper: VueWrapper | null = null;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openBibleWindow.mockResolvedValue(undefined);
    mocks.databaseGet.mockImplementation(async (key: string) =>
      key === "pt_bible_book" ? books : key === "bible_1_65_1" ? chapter : null
    );
    mocks.postApi.mockResolvedValue({ ok: true });
    mocks.apiFetch.mockImplementation(async (url: string) => {
      const data = url.includes("/api/user-data")
        ? { value: 1 }
        : url.includes("bible-downloaded")
          ? { downloaded: [1] }
          : url.includes("pt_params")
            ? { bible_versions: [{ id_bible_version: 1, name: "Versão", abbreviation: "V" }] }
            : url.includes("pt_bible_book")
              ? books
              : url.includes("bible_1_65_1")
                ? chapter
                : null;
      return { ok: true, json: async () => data };
    });
  });
  afterEach(() => wrapper?.unmount());

  it("envia a seleção remota uma vez ao host sem projetar nem abrir módulos no dispositivo", async () => {
    wrapper = shallowMount(RemoteBible, {
      props: {
        token: "remote-token",
        activeBible: {
          active: false,
          reference: "",
          bookId: null,
          chapter: null,
          verse: null,
          chapterVerses: [],
          versionId: null,
        },
      },
      global,
    });
    await flushPromises();
    await wrapper.get(".rb-search").trigger("click");
    await flushPromises();
    await chooseVerse(wrapper);

    expect(mocks.postApi).toHaveBeenCalledExactlyOnceWith(
      "/api/bible",
      {
        text: chapter["1"],
        reference: "Judas 1:1",
        bookId: 65,
        versionId: 1,
        chapter: 1,
        verse: 1,
      },
      "remote-token"
    );
    expect(mocks.openBibleWindow).not.toHaveBeenCalled();
    expect(mocks.modulesOpen).not.toHaveBeenCalled();
    expect(mocks.userDataSet).not.toHaveBeenCalled();
    expect(mocks.broadcastSend).not.toHaveBeenCalled();
    const spotlight = wrapper.getComponent(BibleSpotlight);
    expect(spotlight.emitted("select")).toEqual([[expectedResult]]);
    expect(spotlight.props("modelValue")).toBe(false);
    expect(wrapper.emitted("update:active-bible")?.at(-1)?.[0]).toMatchObject({
      active: true,
      reference: "Judas 1:1",
      bookId: 65,
      chapter: 1,
      verse: 1,
    });
  });

  it("continua projetando e abrindo a Bíblia nos hosts locais por padrão", async () => {
    wrapper = shallowMount(BibleSpotlight, { props: { modelValue: false }, global });
    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    await chooseVerse(wrapper);

    expect(mocks.openBibleWindow).toHaveBeenCalledTimes(1);
    expect(mocks.userDataSet).toHaveBeenCalledExactlyOnceWith(KEYS.MODULES.BIBLE.IS_PLAYING, true);
    expect(mocks.modulesOpen).toHaveBeenCalledExactlyOnceWith("bible");
    expect(mocks.broadcastSend).toHaveBeenCalledWith(BROADCAST_TYPE.BIBLE_VERSE_INTENT, {
      text: chapter["1"],
      reference: "Judas 1:1",
      book_id: 65,
      chapter: 1,
      verses: [1],
      version_id: 1,
      version: "",
      active: true,
    });
    expect(mocks.broadcastSend).toHaveBeenCalledWith(BROADCAST_TYPE.RIBBON_SELECT_PAGE, {
      pageId: "ctx_bible",
    });
    expect(wrapper.emitted("select")).toEqual([[expectedResult]]);
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
    expect(mocks.postApi).not.toHaveBeenCalled();
  });
});
