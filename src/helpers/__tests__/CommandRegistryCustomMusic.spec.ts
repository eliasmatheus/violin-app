import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchMusicItem } from "@/types/Music";

const mocks = vi.hoisted(() => ({
  loadCustomMusicCatalog: vi.fn(),
  getSong: vi.fn(),
  open: vi.fn(),
  openCustomSong: vi.fn(),
  remote: false,
}));
vi.mock("@/helpers/Modules", () => ({ default: {} }));
vi.mock("@/helpers/Platform", () => ({
  default: {
    get isRemote() {
      return mocks.remote;
    },
  },
}));
vi.mock("@/helpers/ProjectionWindows", () => ({
  currentMediaKind: vi.fn(),
  openMediaWindow: vi.fn(),
}));
vi.mock("@/helpers/CustomMusicCatalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/helpers/CustomMusicCatalog")>()),
  loadCustomMusicCatalog: mocks.loadCustomMusicCatalog,
}));
vi.mock("@/helpers/CustomSongs", () => ({ getSong: mocks.getSong }));
vi.mock("@/composables/useMedia", () => ({
  default: { open: mocks.open, openCustomSong: mocks.openCustomSong },
}));

const customMusic = (name = "Esperança", collection = "Juventude"): SearchMusicItem => ({
  id_music: -2,
  name,
  albums: [],
  custom_song_id: "song-a",
  custom_collection_names: [collection],
});
const userdata = { get: (_key: string, fallback: unknown) => fallback };
const translate = (key: string) =>
  key === "components.music_search.custom_album" ? "Coletânea personalizada" : key;
const database = {
  get: vi.fn(async () => [{ id_music: 9, name: "Oficial", albums: [] }]),
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.remote = false;
  mocks.loadCustomMusicCatalog.mockResolvedValue([customMusic()]);
});

describe("músicas personalizadas na paleta", () => {
  it("pesquisa por título e por coletânea e atualiza o acervo pessoal ao reabrir", async () => {
    const registry = await import("@/helpers/CommandRegistry");
    await registry.getAll(database, userdata, translate);
    expect(registry.search("Esperança").results.map((item) => item.id)).toContain(
      "custom-music:song-a"
    );
    expect(registry.search("Juventude").results[0].subtitle).toBe(
      "Coletânea personalizada · Juventude"
    );
    mocks.loadCustomMusicCatalog.mockResolvedValue([customMusic("Renovação", "Coral")]);
    await registry.getAll(database, userdata, translate);
    expect(registry.search("Coral").results[0].title).toBe("Renovação");
    expect(registry.search("Juventude").results).toEqual([]);
    expect(database.get).toHaveBeenCalledTimes(2); // músicas e categorias só na primeira carga
    mocks.loadCustomMusicCatalog.mockResolvedValue([]);
    const afterDelete = await registry.getAll(database, userdata, translate);
    expect(afterDelete.some((item) => item.id === "custom-music:song-a")).toBe(false);
    expect(afterDelete.some((item) => item.id === "music:9")).toBe(true);
  });

  it("executa o documento atual pelo UUID, sem enviar o ID virtual ao catálogo oficial", async () => {
    const registry = await import("@/helpers/CommandRegistry");
    const all = await registry.getAll(database, userdata, translate);
    const song = { id: "song-a", nome: "Título editado", slides: [{ letra: "Atualizada" }] };
    mocks.getSong.mockResolvedValue(song);
    await all.find((item) => item.id === "custom-music:song-a").run();
    expect(mocks.getSong).toHaveBeenCalledWith("song-a");
    expect(mocks.openCustomSong).toHaveBeenCalledWith(song);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("não executa um resultado cujo documento foi excluído enquanto a paleta estava aberta", async () => {
    const registry = await import("@/helpers/CommandRegistry");
    const all = await registry.getAll(database, userdata, translate);
    mocks.getSong.mockResolvedValue(null);
    await all.find((item) => item.id === "custom-music:song-a").run();
    expect(mocks.openCustomSong).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("mantém a busca pessoal disponível quando o catálogo remoto falha", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = await import("@/helpers/CommandRegistry");
    await registry.getAll(
      {
        get: async () => {
          throw new Error("offline");
        },
      },
      userdata,
      translate
    );
    expect(registry.search("Esperança").results[0].id).toBe("custom-music:song-a");
    warn.mockRestore();
  });

  it("não oferece documentos locais no controle remoto", async () => {
    mocks.remote = true;
    const registry = await import("@/helpers/CommandRegistry");
    const all = await registry.getAll(database, userdata, translate);
    expect(mocks.loadCustomMusicCatalog).not.toHaveBeenCalled();
    expect(all.some((item) => item.id.startsWith("custom-music:"))).toBe(false);
  });
});
