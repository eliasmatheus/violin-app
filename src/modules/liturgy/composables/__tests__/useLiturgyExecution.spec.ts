/** Execução da liturgia: projeção interna e vínculo com sobreposição. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  openSlja: vi.fn(),
  openPath: vi.fn(),
  openAudio: vi.fn(),
  projectFile: vi.fn(),
  openMusic: vi.fn(),
  openCustomSong: vi.fn(),
  openYouTube: vi.fn(),
  readAllOverlaySlots: vi.fn(),
  writeOverlaySlot: vi.fn(),
  userdataSet: vi.fn(),
  idbGetAll: vi.fn(),
  getCustomSong: vi.fn(),
  resolveAudio: vi.fn(),
  openAnnouncementsWindow: vi.fn(),
  broadcastSend: vi.fn(),
  broadcastGetLastPayload: vi.fn(),
  systemPlayer: false,
}));

vi.mock("../../i18n", () => ({
  useLiturgyI18n: () => ({ t: (key: string) => key }),
  chaveLiturgia: (key: string) => key,
}));
vi.mock("@/helpers/SljaPlayer", () => ({ openSlja: mocks.openSlja, SLJA_EXT: "slja" }));
vi.mock("@/helpers/Platform", () => ({
  default: { isDesktop: true, api: { shell: { openPath: mocks.openPath } } },
}));
vi.mock("@/helpers/UserData", () => ({
  default: {
    get: (_key: string, fallback: unknown) => (mocks.systemPlayer ? true : fallback),
    set: mocks.userdataSet,
  },
}));
vi.mock("@/composables/useMedia", () => ({
  default: {
    close: vi.fn(),
    stop: vi.fn(),
    open: mocks.openMusic,
    openCustomSong: mocks.openCustomSong,
    openYouTube: mocks.openYouTube,
    openAudio: mocks.openAudio,
    projectFile: mocks.projectFile,
  },
}));
vi.mock("@/composables/useBackgroundSound", () => ({
  useBackgroundSound: () => ({ currentFile: { value: null } }),
}));
vi.mock("@/composables/useFileProjection", () => ({ useFileProjection: () => ({ start: vi.fn() }) }));
vi.mock("@/helpers/Liturgy", () => ({ default: {} }));
vi.mock("@/helpers/ImageConvert", () => ({ heicToJpeg: vi.fn() }));
vi.mock("@/helpers/Alert", () => ({ default: { error: vi.fn(), info: vi.fn(), show: vi.fn() } }));
vi.mock("@/helpers/Broadcast", () => ({
  default: { send: mocks.broadcastSend, getLastPayload: mocks.broadcastGetLastPayload },
}));
vi.mock("@/helpers/ProjectionWindows", () => ({
  openFileProjectionWindows: vi.fn(async () => {}),
  openAnnouncementsWindow: mocks.openAnnouncementsWindow,
}));
vi.mock("@/helpers/AppData", () => ({ default: { get: vi.fn(), set: vi.fn() } }));
vi.mock("@/helpers/IndexedDB", () => ({ default: { getAll: mocks.idbGetAll } }));
vi.mock("@/helpers/Overlay", () => ({
  readAllSlots: mocks.readAllOverlaySlots,
  writeSlot: mocks.writeOverlaySlot,
}));
vi.mock("@/helpers/CustomSongs", () => ({ getSong: mocks.getCustomSong }));
vi.mock("@/helpers/AudioLibrary", () => ({ resolveAudio: mocks.resolveAudio }));
vi.mock("@/helpers/Http", () => ({ fetchWithTimeout: vi.fn(), NET_TIMEOUT: { MEDIA: 1 } }));
vi.mock("@/helpers/Telemetry", () => ({
  default: { track: vi.fn(), captureException: vi.fn() },
}));

import { useLiturgyExecution } from "../useLiturgyExecution";
import { LiturgyItemTypeEnum } from "@/enums/LiturgyItemTypeEnum";
import { KEYS } from "@/constants/UserDataKeys";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import type { LiturgyItem } from "@/types/Liturgy";

function arquivo(dir: string, item = "Arquivo"): LiturgyItem {
  return { id: "1", tipo: LiturgyItemTypeEnum.ARQUIVO, item, dir } as LiturgyItem;
}

function linked(item: LiturgyItem): LiturgyItem {
  return { ...item, linked_overlay_id: "slot-1" };
}

function music(mode = "sung"): LiturgyItem {
  return linked({
    id: "music-1",
    tipo: LiturgyItemTypeEnum.MUSICA,
    item: "Hino",
    id_music: 42,
    subtipo: mode,
    escolha: false,
  } as LiturgyItem);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.systemPlayer = false;
  mocks.openSlja.mockResolvedValue(true);
  mocks.openPath.mockResolvedValue({ ok: true });
  mocks.openAudio.mockResolvedValue(undefined);
  mocks.projectFile.mockResolvedValue(true);
  mocks.openMusic.mockResolvedValue(true);
  mocks.openCustomSong.mockResolvedValue(true);
  mocks.openYouTube.mockResolvedValue(true);
  mocks.readAllOverlaySlots.mockResolvedValue([{ id: "slot-1", enabled: false }]);
  mocks.writeOverlaySlot.mockResolvedValue(undefined);
  mocks.idbGetAll.mockResolvedValue([]);
  mocks.getCustomSong.mockResolvedValue(null);
  mocks.resolveAudio.mockResolvedValue(null);
  mocks.openAnnouncementsWindow.mockResolvedValue(true);
  mocks.broadcastGetLastPayload.mockReturnValue(null);
});

describe("liturgia — item de arquivo .slja", () => {
  it("apresenta dentro do app, sem entregar ao sistema", async () => {
    const { executeItem } = useLiturgyExecution();

    await executeItem(arquivo("C:\\Culto\\hino.slja", "Hino de abertura"));

    expect(mocks.openSlja).toHaveBeenCalledTimes(1);
    expect(mocks.openSlja).toHaveBeenCalledWith("louvorja://local/C:/Culto/hino.slja", {
      title: "Hino de abertura",
      origin: "liturgy",
    });
    expect(mocks.openPath).not.toHaveBeenCalled();
  });

  it("caminho Unix e extensão em maiúsculas também ficam no app", async () => {
    const { executeItem } = useLiturgyExecution();

    await executeItem(arquivo("/Users/ana/Slides/Anúncios.SLJA"));

    expect(mocks.openSlja).toHaveBeenCalledTimes(1);
    expect(mocks.openSlja.mock.calls[0][0]).toBe(
      "louvorja://local/Users/ana/Slides/An%C3%BAncios.SLJA"
    );
    expect(mocks.openPath).not.toHaveBeenCalled();
  });

  it("com o reprodutor do sistema ligado, .slja continua no app", async () => {
    mocks.systemPlayer = true;
    const { executeItem } = useLiturgyExecution();

    await executeItem(arquivo("/Users/ana/hino.slja"));

    expect(mocks.openSlja).toHaveBeenCalledTimes(1);
    expect(mocks.openPath).not.toHaveBeenCalled();
  });

  it("controle: com a preferência ligada, um vídeo ainda vai para o sistema", async () => {
    mocks.systemPlayer = true;
    const { executeItem } = useLiturgyExecution();

    await executeItem(arquivo("/Users/ana/aviso.mp4"));

    expect(mocks.openPath).toHaveBeenCalledWith("/Users/ana/aviso.mp4");
    expect(mocks.openSlja).not.toHaveBeenCalled();
  });

  it("imagem e vídeo passam pela posse de palco compartilhada antes de publicar", async () => {
    const { executeItem } = useLiturgyExecution();
    await executeItem(arquivo("/Users/ana/aviso.png", "Aviso"));
    expect(mocks.projectFile).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image", title: "Aviso" })
    );

    await executeItem(arquivo("/Users/ana/aviso.mp4", "Vídeo"));
    expect(mocks.projectFile).toHaveBeenCalledWith(
      expect.objectContaining({ type: "video", title: "Vídeo" }),
      expect.any(String)
    );
  });
});

describe("liturgia — vínculo de sobreposição", () => {
  it("liga o slot apenas depois de a projeção da imagem confirmar sucesso", async () => {
    let finishProjection!: (_success: boolean) => void;
    mocks.projectFile.mockReturnValueOnce(new Promise<boolean>((resolve) => {
      finishProjection = resolve;
    }));

    const { executeItem } = useLiturgyExecution();
    const execution = executeItem(linked(arquivo("/Users/ana/aviso.png")));
    await vi.waitFor(() => expect(mocks.projectFile).toHaveBeenCalledTimes(1));
    expect(mocks.writeOverlaySlot).not.toHaveBeenCalled();

    finishProjection(true);
    await execution;
    expect(mocks.writeOverlaySlot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "slot-1", enabled: true })
    );
    expect(mocks.userdataSet).toHaveBeenCalledWith(KEYS.MODULES.OVERLAY.ENABLED, true);
  });

  it("não liga o slot quando a projeção falha ou o arquivo abre fora do app", async () => {
    const { executeItem } = useLiturgyExecution();
    mocks.projectFile.mockResolvedValueOnce(false);
    await executeItem(linked(arquivo("/Users/ana/aviso.png")));

    mocks.openSlja.mockResolvedValueOnce(false);
    await executeItem(linked(arquivo("/Users/ana/slides.slja")));

    mocks.systemPlayer = true;
    await executeItem(linked(arquivo("/Users/ana/aviso.mp4")));

    expect(mocks.openPath).toHaveBeenCalledWith("/Users/ana/aviso.mp4");
    expect(mocks.writeOverlaySlot).not.toHaveBeenCalled();
    expect(mocks.userdataSet).not.toHaveBeenCalled();
  });

  it("não liga o slot para áudio ou para anúncios sem slides selecionados", async () => {
    const { executeItem } = useLiturgyExecution();
    await executeItem(linked(arquivo("/Users/ana/audio.mp3")));
    mocks.idbGetAll.mockResolvedValueOnce([
      { id: "slide-1", nome: "Aviso", ordem: 1, texto: "Olá" },
    ]);
    await executeItem(linked({
      id: "announcements-1",
      tipo: LiturgyItemTypeEnum.ANUNCIOS,
      anuncios_ids: [],
    } as unknown as LiturgyItem));

    expect(mocks.openAudio).toHaveBeenCalledTimes(1);
    expect(mocks.broadcastSend).not.toHaveBeenCalled();
    expect(mocks.writeOverlaySlot).not.toHaveBeenCalled();
  });

  it("só liga o slot de anúncios se a janela de projeção realmente abrir", async () => {
    const { executeItem } = useLiturgyExecution();
    const announcement = linked({
      id: "announcements-2",
      tipo: LiturgyItemTypeEnum.ANUNCIOS,
      anuncios_ids: ["slide-1"],
    } as unknown as LiturgyItem);
    mocks.idbGetAll.mockResolvedValue([
      { id: "slide-1", nome: "Aviso", ordem: 1, texto: "Olá" },
    ]);
    mocks.broadcastGetLastPayload.mockImplementation(() => {
      const intent = mocks.broadcastSend.mock.calls.find(
        ([type]) => type === BROADCAST_TYPE.ANNOUNCEMENTS_INTENT
      );
      return intent?.[1] ?? null;
    });

    mocks.openAnnouncementsWindow.mockResolvedValueOnce(false);
    await executeItem(announcement);
    expect(mocks.openAnnouncementsWindow).toHaveBeenCalledTimes(1);
    expect(mocks.writeOverlaySlot).not.toHaveBeenCalled();

    mocks.broadcastSend.mockClear();
    await executeItem(announcement);
    expect(mocks.writeOverlaySlot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "slot-1", enabled: true })
    );
  });

  it("liga o slot ao tocar diretamente uma música visual, mas não a faixa só em áudio", async () => {
    const { playMusic } = useLiturgyExecution();
    expect(await playMusic(music("sung"), "sung")).toBe(true);
    expect(mocks.writeOverlaySlot).toHaveBeenCalledTimes(1);

    mocks.writeOverlaySlot.mockClear();
    mocks.userdataSet.mockClear();
    expect(await playMusic(music("audio"), "audio")).toBe(false);
    expect(mocks.openAudio).toHaveBeenCalledTimes(1);
    expect(mocks.writeOverlaySlot).not.toHaveBeenCalled();
    expect(mocks.userdataSet).not.toHaveBeenCalled();
  });

  it("não liga o slot se a música visual não iniciar a projeção", async () => {
    mocks.openMusic.mockResolvedValueOnce(false);
    const { playMusic } = useLiturgyExecution();

    expect(await playMusic(music("lyric"), "lyric")).toBe(false);
    expect(mocks.writeOverlaySlot).not.toHaveBeenCalled();
    expect(mocks.userdataSet).not.toHaveBeenCalled();
  });

  it("música personalizada só em áudio não abre slides nem liga o slot", async () => {
    mocks.getCustomSong.mockResolvedValue({
      id: "custom-1",
      nome: "Canção personalizada",
      audio_token: "audio:custom-1",
    });
    mocks.resolveAudio.mockResolvedValue("blob:audio-customizado");
    const customMusic = linked({
      id: "music-custom",
      tipo: LiturgyItemTypeEnum.MUSICA,
      item: "Canção personalizada",
      id_music: -1,
      ref_id: "custom-1",
      subtipo: "audio",
      escolha: false,
    } as LiturgyItem);
    const { playMusic } = useLiturgyExecution();

    expect(await playMusic(customMusic, "audio")).toBe(false);
    expect(mocks.openAudio).toHaveBeenCalledWith({
      url: "blob:audio-customizado",
      title: "Canção personalizada",
      mediaType: "audio",
    });
    expect(mocks.openCustomSong).not.toHaveBeenCalled();
    expect(mocks.writeOverlaySlot).not.toHaveBeenCalled();
  });
});
