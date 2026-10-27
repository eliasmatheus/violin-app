import { beforeEach, describe, expect, it, vi } from "vitest";

const open = vi.fn();
const openCustomMusic = vi.fn(async () => true);
const warning = vi.fn();
vi.mock("@/composables/useMedia", () => ({ default: { open: (...a: unknown[]) => open(...a) } }));
vi.mock("@/helpers/CustomMusicCatalog", () => ({
  openCustomMusic: (...a: unknown[]) => openCustomMusic(...(a as [])),
}));
vi.mock("@/helpers/Snackbar", () => ({ default: { warning: (...a: unknown[]) => warning(...a) } }));
vi.mock("@/i18n", () => ({ i18nAtual: () => null }));

const { quickPlay, isQuickPlayEnter } = await import("../QuickPlay");

beforeEach(() => {
  open.mockClear();
  openCustomMusic.mockClear();
  warning.mockClear();
});

describe("quickPlay — Enter da busca", () => {
  it("Enter toca cantado (slides com a voz)", () => {
    expect(quickPlay({ id_music: 12, has_instrumental_music: true })).toBe(true);
    expect(open).toHaveBeenCalledWith({ id_music: 12, mode: "audio" });
  });

  it("Shift+Enter toca o playback", () => {
    expect(quickPlay({ id_music: "12", has_instrumental_music: true }, true)).toBe(true);
    expect(open).toHaveBeenCalledWith({ id_music: 12, mode: "instrumental" });
  });

  it("sem playback, avisa e não toca a voz no lugar", () => {
    expect(quickPlay({ id_music: 12, has_instrumental_music: false, name: "Hino" }, true)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("música personalizada toca pelo UUID", () => {
    expect(quickPlay({ custom_song_id: "abc", id_music: null }, true)).toBe(true);
    expect(openCustomMusic).toHaveBeenCalledWith("abc", "instrumental");
  });

  it("sem resultado, não faz nada", () => {
    expect(quickPlay(undefined)).toBe(false);
    expect(quickPlay({ id_music: null })).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("Enter com Ctrl/Alt ou compondo acento não toca", () => {
    const ev = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { key: "Enter", ...init });
    expect(isQuickPlayEnter(ev({}))).toBe(true);
    expect(isQuickPlayEnter(ev({ shiftKey: true }))).toBe(true);
    expect(isQuickPlayEnter(ev({ ctrlKey: true }))).toBe(false);
    expect(isQuickPlayEnter(ev({ altKey: true }))).toBe(false);
    expect(isQuickPlayEnter(new KeyboardEvent("keydown", { key: "a" }))).toBe(false);
  });
});
