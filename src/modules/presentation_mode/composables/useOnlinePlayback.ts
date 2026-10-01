import { computed, type Ref } from "vue";
import Telemetry from "@/helpers/Telemetry";
import { videoIdFromUrl, youtubeEmbedUrl } from "@/helpers/OnlineVideo";
import Media from "@/composables/useMedia";
import type { ProgramItem } from "@/types/Presentation";
import type { Playable } from "../program/playable";
import { useOnlineLibrary, type OnlineEntry } from "./useOnlineLibrary";

/**
 * Vídeos do YouTube no palco: como um vídeo da aba vira um Playable, como ele
 * vai ao ar e a fila da lista de onde ele saiu.
 */

export function onlinePlayable(video: OnlineEntry): Playable {
  return { type: "online", videoId: video.id, title: video.title, channel: video.channel };
}

/** O vídeo vai ao ar pelo mesmo caminho dos outros módulos: baixado, transmitido ou embutido. */
export function openOnline(videoId: string, title: string): void {
  void Media.openYouTube(youtubeEmbedUrl(videoId), title).catch((error: unknown) => {
    Telemetry.captureException(error, { source: "presentation_mode.online.open" });
  });
}

/** Vídeo do YouTube de um item do programa, se ele for um. */
export function itemVideoId(item: ProgramItem | null | undefined): string | null {
  return item?.kind === "online_video" ? videoIdFromUrl(item.source?.url) : null;
}

/**
 * A fila da playlist ou do canal de onde saiu o vídeo no ar: Anterior/Próximo
 * andam por ela enquanto aquele vídeo for o que está no ar.
 */
export function useOnlineQueue(liveOrigin: Ref<Playable | null>) {
  const lib = useOnlineLibrary();

  const live = computed(() => {
    const q = lib.queue.value;
    const origin = liveOrigin.value;
    return !!q && origin?.type === "online" && q.entries[q.index]?.id === origin.videoId;
  });

  /** O vídeo seguinte da lista — o candidato natural a ir ao ar. */
  const nextId = computed(() => {
    const q = lib.queue.value;
    return live.value && q ? (q.entries[q.index + 1]?.id ?? null) : null;
  });

  /** Põe no ar o vídeo vizinho e devolve o Playable dele; null quando não há para onde ir. */
  function step(to: "first" | "prev" | "next" | "last"): Playable | null {
    const video = lib.stepQueue(to);
    if (!video) return null;
    openOnline(video.id, video.title);
    return onlinePlayable(video);
  }

  return { queue: lib.queue, live, nextId, step, start: lib.startQueue };
}
