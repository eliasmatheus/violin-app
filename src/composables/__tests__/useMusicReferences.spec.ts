import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { mountUi } from "@/components/ui/__tests__/mountUi";
import { useMusicReferences } from "../useMusicReferences";
import { KEYS } from "@/constants/UserDataKeys";
import { musicTitle } from "@root/config/musicCatalog.mjs";

const disabled = ref<(number | string)[]>([]);
vi.mock("@/helpers/UserData", () => ({
  default: {
    get: (key: string, fallback: unknown) =>
      key === KEYS.OPTIONS.DISABLED_ALBUMS
        ? disabled.value
        : key.includes("hymnal_1996")
          ? true
          : fallback,
  },
}));
vi.mock("@/helpers/Database", () => ({
  default: {
    get: async (key: string) =>
      key.endsWith("_musics")
        ? [
            {
              id_music: 1,
              name: "Antiga",
              albums: [
                {
                  id_album: 629,
                  name: "Hinário Adventista 1996",
                  type: "hymnal",
                  pivot: { track: 1 },
                },
              ],
            },
            {
              id_music: 2,
              name: "Atual",
              albums: [
                { id_album: 712, name: "Hinário Adventista", type: "hymnal", pivot: { track: 2 } },
              ],
            },
            {
              id_music: 3,
              name: "Outra",
              albums: [
                { id_album: 712, name: "Hinário Adventista", type: "hymnal", pivot: { track: 3 } },
              ],
            },
          ]
        : [],
  },
}));

const source = ref([
  { id_music: 2, name: "Atual" },
  { id_music: 1, name: "Antiga" },
  { id_music: 3, name: "Outra" },
]);
const component = defineComponent({ setup: () => useMusicReferences(source), template: "<div />" });
const wrappers: ReturnType<typeof mountUi<typeof component>>[] = [];

beforeEach(() => {
  disabled.value = [];
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("referências salvas de favoritos, histórico e playlists", () => {
  it("filtra reativamente, preserva a ordem e exibe os números do catálogo", async () => {
    const wrapper = mountUi(component);
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.vm.items.map((song) => song.id_music)).toEqual([2, 1, 3]);
    expect(musicTitle(wrapper.vm.items[0])).toBe("Hino nº 2 - Atual");
    disabled.value = ["629"];
    await flushPromises();
    expect(wrapper.vm.items.map((song) => song.id_music)).toEqual([2, 3]);
    expect(wrapper.vm.isAvailable({ id_music: 1 })).toBe(false);
    expect(source.value).toHaveLength(3);
    disabled.value = [];
    await flushPromises();
    expect(wrapper.vm.items.map((song) => song.id_music)).toEqual([2, 1, 3]);
  });

  it("reordenar os favoritos visíveis conserva os ocultos e não persiste metadados derivados", async () => {
    disabled.value = [629];
    const wrapper = mountUi(component);
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.vm.reorder([...wrapper.vm.items].reverse())).toEqual([
      { id_music: 3, name: "Outra" },
      { id_music: 1, name: "Antiga" },
      { id_music: 2, name: "Atual" },
    ]);
    expect(source.value.map((song) => song.id_music)).toEqual([2, 1, 3]);
  });
});
