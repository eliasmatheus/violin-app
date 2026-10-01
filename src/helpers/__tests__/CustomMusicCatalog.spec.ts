import { beforeEach, describe, expect, it, vi } from "vitest";
import { DB_TABLE } from "@/constants/DbTables";
import { musicAlbumLabel } from "@root/config/musicCatalog.mjs";

const { getAll } = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock("@/helpers/DocStore", () => ({ default: { getAll } }));
import { loadCustomMusicCatalog } from "@/helpers/CustomMusicCatalog";

let songs: unknown[];
let collections: unknown[];
beforeEach(() => {
  songs = [{ id: "song-a", nome: "Esperança", slides: [{ letra: "Não indexar" }] }];
  collections = [];
  getAll
    .mockReset()
    .mockImplementation(async (table: string) =>
      table === DB_TABLE.CUSTOM_SONGS ? songs : collections
    );
});

describe("catálogo pessoal de busca", () => {
  it("indexa uma música uma vez e inclui todas as suas coletâneas", async () => {
    collections = [
      { nome: "Juventude", song_ids: ["song-a", "song-a"] },
      { nome: "Culto", song_ids: ["song-a", "apagada"] },
      { nome: "Culto", song_ids: ["song-a"] },
    ];
    const items = await loadCustomMusicCatalog();
    expect(items).toEqual([
      {
        id_music: -2,
        name: "Esperança",
        custom_song_id: "song-a",
        custom_collection_names: ["Juventude", "Culto"],
        has_audio: false,
        has_instrumental_music: false,
        albums: [],
      },
    ]);
    expect(musicAlbumLabel(items[0], "Coletânea personalizada")).toBe(
      "Coletânea personalizada · Juventude · Culto"
    );
  });

  it("diz que faixas a música tem, para as listas oferecerem só o que toca", async () => {
    songs = [
      { id: "a", nome: "Cantada", audio_token: "lib://audio/1.mp3" },
      { id: "b", nome: "Com as duas", audio_token: "lib://audio/1.mp3", playback_token: "lib://audio/2.mp3" },
      { id: "c", nome: "Só playback", audio_token: "", playback_token: "lib://audio/2.mp3" },
      { id: "d", nome: "Só slides", audio_token: "", playback_token: 5 },
    ];
    const items = await loadCustomMusicCatalog();
    expect(items.map((item) => [item.has_audio, item.has_instrumental_music])).toEqual([
      [true, false],
      [true, true],
      [false, true],
      [false, false],
    ]);
  });

  it("mantém músicas sem coletânea pesquisáveis e com o título normal", async () => {
    const [item] = await loadCustomMusicCatalog();
    expect(item.name).toBe("Esperança");
    expect(musicAlbumLabel(item, "Coletânea personalizada")).toBe("Coletânea personalizada");
  });

  it("ignora documentos inválidos e vínculos inválidos sem perder os válidos", async () => {
    songs.push(null, [], { id: 5, nome: "Inválida" }, { id: "vazia", nome: " " });
    songs.push({ id: "song-a", nome: "Duplicada" });
    collections = [
      null,
      { nome: 5, song_ids: ["song-a"] },
      { nome: "Sem vínculos", song_ids: "song-a" },
      { nome: " Válida ", song_ids: [null, 5, "", "song-a"] },
    ];
    const items = await loadCustomMusicCatalog();
    expect(items).toHaveLength(1);
    expect(items[0].custom_collection_names).toEqual(["Válida"]);
  });

  it("preserva músicas quando a leitura das coletâneas falha", async () => {
    getAll.mockImplementation(async (table: string) => {
      if (table === DB_TABLE.CUSTOM_COLLECTIONS) throw new Error("leitura indisponível");
      return songs;
    });
    expect(await loadCustomMusicCatalog()).toHaveLength(1);
  });

  it("retorna uma lista vazia quando as músicas não podem ser lidas", async () => {
    getAll.mockRejectedValue(new Error("leitura indisponível"));
    expect(await loadCustomMusicCatalog()).toEqual([]);
  });
});
