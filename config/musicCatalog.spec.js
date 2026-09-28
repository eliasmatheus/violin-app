// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  albumYears,
  albumYear,
  hymnalTracks,
  isHymnalTrack,
  musicAlbumLabel,
  musicTitle,
  prepareMusicCatalog,
} from "./musicCatalog.mjs";

const music = (id, name, album, track) => ({
  id_music: id,
  name,
  albums_names: album.name,
  albums: [{ ...album, pivot: { track } }],
});
const old = { id_album: 629, name: "Hinário Adventista 1996", type: "hymnal" };
const current = { id_album: 712, name: "Hinário Adventista", type: "hymnal" };

describe("catálogo de músicas em todos os produtos", () => {
  it("obtém anos explícitos, intervalos das categorias e a edição atual sem ano no nome", () => {
    expect(albumYear(current)).toBe(2022);
    expect(albumYear(old)).toBe(1996);
    expect(albumYear({ id_album: 1, name: "Louvor 2010", year: 2026 })).toBe(2026);
    expect(albumYears([{ albums: [{ id_album: 1, subtitle: "2024-2025" }] }]).get("1")).toBe(2025);
    expect(albumYears(null).size).toBe(0);
  });

  it("ordena pelo maior ano em vez de pelo título ou id do álbum", () => {
    const catalog = [
      music(1, "Antiga", old, 28),
      music(2, "Zelo", current, 28),
      music(3, "Nova", { id_album: 1, name: "Meu Lugar" }, 1),
    ];
    const years = albumYears([{ albums: [{ id_album: 1, subtitle: "2026" }] }]);
    expect(prepareMusicCatalog(catalog, [], years).map((m) => m.id_music)).toEqual([3, 2, 1]);
    expect(catalog.map((m) => m.id_music)).toEqual([1, 2, 3]);
    expect(catalog[2].albums[0]).not.toHaveProperty("year");
  });

  it("oculta músicas exclusivas e os vínculos desativados de músicas compartilhadas", () => {
    const shared = {
      ...music(3, "Compartilhada", old, 128),
      albums: [
        { ...old, pivot: { track: 128 } },
        { ...current, pivot: { track: 28 } },
      ],
    };
    const catalog = [music(1, "Antiga", old, 28), music(2, "Nova", current, 28), shared];
    const visible = prepareMusicCatalog(catalog, ["629"]);
    expect(visible.map((m) => m.id_music)).toEqual([3, 2]);
    expect(musicAlbumLabel(visible[0])).toBe("Hino nº 28 - Hinário Adventista");
    expect(isHymnalTrack(visible[0], "128")).toBe(false);
    expect(visible[0].albums_names).not.toContain("1996");
    expect(shared.albums).toHaveLength(2);
    expect(prepareMusicCatalog(catalog, [629, 712])).toEqual([]);
    expect(prepareMusicCatalog(catalog)).toHaveLength(3);
  });

  it("o número exato pertence ao hinário e não à faixa de um CD comum", () => {
    expect(isHymnalTrack(music(1, "Hino", current, 128), "28")).toBe(false);
    expect(isHymnalTrack(music(1, "Hino", current, 28), "028")).toBe(true);
    expect(hymnalTracks(music(2, "Faixa", { ...current, type: "collection" }, 28))).toEqual([]);
    expect(hymnalTracks(music(2, "Inválida", current, 0))).toEqual([]);
    expect(isHymnalTrack(music(2, "Inválida", current, 28), "")).toBe(false);
  });

  it("padroniza coletâneas personalizadas e números sem mudar os nomes do catálogo", () => {
    const custom = { name: "DESPERTA", custom_song_id: "abc" };
    expect(musicAlbumLabel(custom, "Coletânea personalizada")).toBe("Coletânea personalizada");
    expect(musicTitle(custom)).toBe("DESPERTA");
    expect(musicTitle(music(1, "Santo", current, 1))).toBe("Hino nº 1 - Santo");
    expect(musicTitle(music(1, "Santo", current, 1), "Música")).toBe("Hino nº 1 - Santo");
    expect(musicTitle(custom, "Música")).toBe("Música DESPERTA");
    expect(musicAlbumLabel({ name: "Sem metadados", albums_names: "Outro álbum" })).toBe(
      "Outro álbum"
    );
  });
});
