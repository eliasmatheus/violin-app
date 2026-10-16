import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import $appdata from "@/helpers/AppData";
import { KEYS } from "@/constants/UserDataKeys";
import Media from "@/composables/useMedia";
import { useAudioPlayback } from "@/composables/useAudioPlayback";
import type { LiveKind } from "./useLiveContent";
import { useLiveContent } from "./useLiveContent";
import type { PartPosition, Step } from "./useLiveNavigation";
import { usePlayerMute } from "./usePlayerMute";

/**
 * O que a barra de controle do centro faz com o que está no ar, para toda
 * mídia: os mesmos três verbos (reproduzir/pausar, silenciar, tirar do ar) e
 * as partes. Reproduzir muda de sentido conforme a mídia — o áudio da
 * música, o vídeo, ou "passar sozinho" nas páginas e arquivos sem tempo —, e
 * fica apagado quando não há o que reproduzir. Nunca vira outra coisa.
 */

/** Intervalo do "passar sozinho" (páginas do PDF, arquivos da pasta ou do momento). */
export const AUTO_ADVANCE_MS = 8000;

export function useLiveTransport(deps: {
  liveKind: Ref<LiveKind | null>;
  /** Áudio solto no ar (não vai às telas). */
  audioLive: Ref<boolean>;
  position: Ref<PartPosition | null>;
  navigate: (to: Step) => void;
  locked: Ref<boolean>;
}) {
  const audio = useAudioPlayback();
  const live = useLiveContent();
  const playerMute = usePlayerMute();

  /** Vídeo no ar — arquivo local ou on-line. */
  const isVideo = computed(
    () =>
      deps.liveKind.value === "online_video" ||
      (deps.liveKind.value === "file" && live.file.value?.type === "video")
  );
  const musicHasAudio = computed(
    () =>
      deps.liveKind.value === "music" && !!$appdata.get<string>(KEYS.MODULES.MEDIA.CONFIG.AUDIO, "")
  );
  /** O player do operador está tocando algo com tempo: a linha e o restante seguem ele. */
  const timed = computed(() => isVideo.value || deps.audioLive.value || musicHasAudio.value);

  const duration = computed(() =>
    Number.isFinite(audio.duration.value) && audio.duration.value > 0 ? audio.duration.value : 0
  );
  const currentTime = computed(() => audio.currentTime.value);

  /** Páginas ou arquivos sem tempo: reproduzir é passar sozinho. */
  const canAutoAdvance = computed(() => {
    const p = deps.position.value;
    return !timed.value && !!p && p.total > 1 && (p.unit === "page" || p.unit === "file");
  });

  const autoAdvancing = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  function stopAuto(): void {
    autoAdvancing.value = false;
    if (timer) clearInterval(timer);
    timer = null;
  }
  function startAuto(): void {
    stopAuto();
    autoAdvancing.value = true;
    timer = setInterval(() => {
      const p = deps.position.value;
      // Chegou ao fim, ou o que está no ar deixou de ter páginas: para sozinho.
      if (!canAutoAdvance.value || !p || p.index >= p.total - 1) return stopAuto();
      deps.navigate("next");
    }, AUTO_ADVANCE_MS);
  }
  // Saiu do ar (ou entrou um vídeo): o passar sozinho não continua por conta própria.
  watch(canAutoAdvance, (can) => {
    if (!can) stopAuto();
  });
  watch(deps.liveKind, (kind) => {
    if (!kind) stopAuto();
  });
  onBeforeUnmount(stopAuto);

  const canPlay = computed(() => !deps.locked.value && (timed.value || canAutoAdvance.value));
  const playing = computed(() => (timed.value ? !audio.isPaused.value : autoAdvancing.value));

  function togglePlay(): void {
    if (!canPlay.value) return;
    if (timed.value) {
      if (audio.isPaused.value) Media.play();
      else Media.pause(true);
    } else if (autoAdvancing.value) stopAuto();
    else startAuto();
  }

  /** Com áudio: o mudo é o do módulo, o mesmo do "Reproduzir sem áudio". */
  const hasAudio = timed;
  function toggleMute(): void {
    if (hasAudio.value) playerMute.toggle();
  }

  function seekBy(seconds: number): void {
    if (timed.value && !deps.locked.value) Media.advanceTime(seconds);
  }
  function seekTo(seconds: number): void {
    if (timed.value && !deps.locked.value) Media.goToTime(seconds);
  }

  return {
    timed,
    isVideo,
    duration,
    currentTime,
    canPlay,
    playing,
    togglePlay,
    autoAdvancing,
    canAutoAdvance,
    hasAudio,
    muted: playerMute.muted,
    toggleMute,
    volume: computed(() => audio.volume.value),
    setVolume: (v: number) => Media.setVolume(v),
    seekBy,
    seekTo,
  };
}
