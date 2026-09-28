import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAlbum } from "../useAlbum";

const state: Record<string, unknown> = {};
let disabled: (number | string)[] = [];
const get = vi.fn();
vi.mock("@/helpers/AppData", () => ({
  default: {
    get: (key: string) => state[key],
    set: (key: string, value: unknown) => {
      state[key] = value;
    },
  },
}));
vi.mock("@/helpers/Database", () => ({ default: { get: (...args: unknown[]) => get(...args) } }));
vi.mock("@/composables/useMusicCatalog", () => ({ getDisabledAlbums: () => disabled }));
vi.mock("@/helpers/Dev", () => ({ default: { write: vi.fn() } }));

beforeEach(() => {
  useAlbum().close();
  Object.keys(state).forEach((key) => {
    delete state[key];
  });
  disabled = [];
  get.mockReset();
});

describe("álbum selecionado para exibição", () => {
  it("prefere o ano maior, exclui álbuns desativados e mantém a escolha explícita ativa", () => {
    state["modules.media.data"] = {
      albums: [
        { id_album: 629, name: "Hinário Adventista 1996", track: 1, order: 0 },
        { id_album: 712, name: "Hinário Adventista", track: 2, order: 5 },
      ],
    };
    const album = useAlbum();
    album.setAlbumInfo(null);
    expect(state["modules.media.config.track"]).toBe(2);
    album.setAlbumInfo(629);
    expect(state["modules.media.config.track"]).toBe(1);
    disabled = ["629"];
    album.setAlbumInfo(null);
    expect(state["modules.media.config.track"]).toBe(2);
    disabled = [629, 712];
    album.setAlbumInfo(null);
    expect(state["modules.media.config.subtitle"]).toBe("");
  });

  it("não abre álbum desativado, incluindo desativação durante o carregamento", async () => {
    disabled = [10];
    expect(await useAlbum().open(10)).toEqual({ redirect: null });
    expect(get).not.toHaveBeenCalled();
    disabled = [];
    get.mockImplementation(async () => {
      disabled = [10];
      return { id_album: 10, name: "Álbum" };
    });
    await useAlbum().open(10);
    expect(state["modules.album.show"]).toBe(false);
    expect(useAlbum().id_album.value).toBeNull();
  });
});
