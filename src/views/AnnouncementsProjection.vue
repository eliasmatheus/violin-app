<template>
  <div
    class="ann-root"
    :style="{
      justifyContent: current?.style?.alignY || 'center',
    }"
  >
    <template v-if="current">
      <!-- Cena da transição: slide anterior e novo se sobrepõem durante a animação -->
      <div v-if="hasContent" class="ann-stage" :style="stageStyle">
        <Transition :name="transitionName">
          <!-- O fundo é do slide, não da raiz: o vnode saindo fica com a cor
               antiga congelada e as duas cores acompanham a animação juntas. -->
          <div
            :key="slideKey"
            class="ann-slide"
            :style="{ background: current?.style?.bgColor || '#000' }"
          >
            <!-- Vídeo -->
            <video
              v-if="mediaUrl('video')"
              :src="mediaUrl('video')"
              class="ann-media"
              :style="mediaFitStyle"
              autoplay
              loop
              playsinline
            />

            <!-- Imagem -->
            <img
              v-else-if="mediaUrl('image')"
              :src="mediaUrl('image')"
              class="ann-media"
              :style="mediaFitStyle"
              alt=""
            />

            <!-- Texto (sempre acima de imagem/vídeo) -->
            <div
              v-if="current.texto"
              class="ann-text"
              :class="{ 'ann-text--over-media': mediaUrl('video') || mediaUrl('image') }"
              :style="textStyle"
            >
              {{ current.texto }}
            </div>
          </div>
        </Transition>
      </div>
      <div v-else class="ann-empty" />
    </template>
    <div v-else class="ann-empty" />
  </div>
</template>

<script setup lang="ts">
/**
 * AnnouncementsProjection — exibe os slides de Anúncios em sequência.
 * Recebe snapshot canônico da janela principal; navegação por
 * setas/espaço e pelo módulo (ANNOUNCEMENTS_CONTROL).
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { CSSProperties } from "vue";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { useBroadcastListener } from "@/composables/useBroadcastListener";
import { useProjectionCloseNotice } from "@/composables/useProjectionCloseNotice";
import { PROJECTION_TYPE } from "@/constants/Projection";
import Broadcast from "@/helpers/Broadcast";
import UserData from "@/helpers/UserData";
import { KEYS } from "@/constants/UserDataKeys";
import {
  TRANSITION_TYPES,
  TRANSITION_PARAMS,
  ZOOM_ORIGIN_PARAM,
  EASE_PARAM,
  readTransitionParam,
  type TransitionParamDef,
  type TransitionType,
} from "@/modules/announcements/transitionOptions";
import {
  AnnouncementsPresentationGate,
  type AnnouncementPacket,
  type AnnouncementSlide,
} from "@/presentation/AnnouncementsPresentationState";

const slides = ref<AnnouncementSlide[]>([]);
const index = ref(0);
const session = ref("");
const isBackward = ref(false);
let currentPacket: AnnouncementPacket | null = null;
const stateGate = new AnnouncementsPresentationGate();

const objectUrls: string[] = [];

const current = computed(() => slides.value[index.value] || null);

/** Marca o índice/sessão recebidos e decide a direção da transição:
 * sessão nova ou avanço → frente; índice menor na mesma sessão → trás. */
function setSlideIndex(next: number, nextSession: string): void {
  const sessionChanged = nextSession !== session.value;
  session.value = nextSession;
  isBackward.value = !sessionChanged && next < index.value;
  index.value = next;
}

const transitionType = computed<TransitionType>(() => {
  const v = UserData.get<string>(KEYS.MODULES.ANNOUNCEMENTS.TRANSITION_TYPE, "none");
  return typeof v === "string" && (TRANSITION_TYPES as readonly string[]).includes(v)
    ? (v as TransitionType)
    : "none";
});

/** Nome da classe Vue Transition — "ann-none" não tem CSS e troca na hora. */
const transitionName = computed(() => `ann-${transitionType.value}`);

const transitionDurationMs = computed(() => {
  const n = Number(UserData.get(KEYS.MODULES.ANNOUNCEMENTS.TRANSITION_DURATION, 500));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10000) : 500;
});

function readParam(p: TransitionParamDef): string {
  return readTransitionParam(p, UserData.get<string>(p.key, p.def));
}

const slideKey = computed(() => `${session.value}:${index.value}`);

/** Vetores do Deslizar — `auto` inverte por navegação (comportamento atual),
 * `horizontal` sempre entra pela direita, `vertical` inverte por baixo/cima. */
function slideVectors(): { ex: string; ey: string; lx: string; ly: string } {
  const dir = readParam(TRANSITION_PARAMS.slide);
  const bwd = isBackward.value;
  if (dir === "vertical")
    return { ex: "0%", ey: bwd ? "-100%" : "100%", lx: "0%", ly: bwd ? "100%" : "-100%" };
  if (dir === "horizontal") return { ex: "100%", ey: "0%", lx: "-100%", ly: "0%" };
  return { ex: bwd ? "-100%" : "100%", ey: "0%", lx: bwd ? "100%" : "-100%", ly: "0%" };
}

/** `auto` inverte por navegação (atual); os lados fixos não invertem. */
function wipeClip(): string {
  const dir = readParam(TRANSITION_PARAMS.wipe);
  if (dir === "right") return "inset(0 0 0 100%)";
  if (dir === "top") return "inset(0 0 100% 0)";
  if (dir === "bottom") return "inset(100% 0 0 0)";
  if (dir === "left") return "inset(0 100% 0 0)";
  return isBackward.value ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
}

function splitClip(): string {
  return readParam(TRANSITION_PARAMS.split) === "vertical"
    ? "inset(50% 0 50% 0)"
    : "inset(0 50% 0 50%)";
}

function flipTransforms(): { enter: string; leave: string } {
  const axis = readParam(TRANSITION_PARAMS.flip) === "vertical" ? "rotateX" : "rotateY";
  const sign = isBackward.value ? -1 : 1;
  return { enter: `${axis}(${sign * 90}deg)`, leave: `${axis}(${sign * -90}deg)` };
}

function originPos(origin: string): string {
  switch (origin) {
    case "top":
      return "50% 0%";
    case "bottom":
      return "50% 100%";
    case "left":
      return "0% 50%";
    case "right":
      return "100% 50%";
    default:
      return "50% 50%";
  }
}

/** Variáveis lidas pelo CSS da stage — direção é variável (não classe) porque
 * o slide saindo é um vnode antigo, com as classes congeladas no tempo do
 * render anterior; a stage é atualizada no mesmo tick e vale para os dois. */
const stageStyle = computed(() => {
  const v = slideVectors();
  const wipe = wipeClip();
  const split = splitClip();
  const flip = flipTransforms();
  const fadeStyle = readParam(TRANSITION_PARAMS.fade);
  const zoomMode = readParam(TRANSITION_PARAMS.zoom);
  return {
    "--trans-dur": `${transitionDurationMs.value}ms`,
    "--trans-ease": readParam(EASE_PARAM),
    "--ent-x": v.ex,
    "--ent-y": v.ey,
    "--lv-x": v.lx,
    "--lv-y": v.ly,
    "--fade-blur": fadeStyle === "blur" ? "12px" : "0px",
    "--fade-delay": fadeStyle === "through_bg" ? `${transitionDurationMs.value}ms` : "0ms",
    "--fade-y": fadeStyle === "motion" ? "30px" : "0px",
    "--zoom-from": zoomMode === "in" ? "0.94" : "1.06",
    "--zoom-origin": originPos(readParam(ZOOM_ORIGIN_PARAM)),
    "--wipe-enter": wipe,
    "--wipe-leave": wipe,
    "--split-enter": split,
    "--split-leave": split,
    "--circle-pos": originPos(readParam(TRANSITION_PARAMS.circle)),
    "--flip-enter": flip.enter,
    "--flip-leave": flip.leave,
  } as CSSProperties;
});

const hasContent = computed(
  () => !!(mediaUrl("video") || mediaUrl("image") || current.value?.texto)
);

/** Cache de object URLs por slide+tipo — criado sob demanda, sem efeitos
 * colaterais dentro de computeds. */
const mediaUrlCache = new Map<string, string>();

function clearMediaCache(): void {
  for (const u of mediaUrlCache.values()) {
    URL.revokeObjectURL(u);
    const i = objectUrls.indexOf(u);
    if (i >= 0) objectUrls.splice(i, 1);
  }
  mediaUrlCache.clear();
}

function mediaUrl(kind: "image" | "video"): string {
  const s = current.value;
  if (!s) return "";
  const key = `${kind}:${s.id}`;
  const cached = mediaUrlCache.get(key);
  if (cached) return cached;
  const data = kind === "video" ? s.videoData : s.imageData;
  if (!data) return "";
  const mime = kind === "video" ? s.videoMime || "video/mp4" : s.imageMime || "image/jpeg";
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  mediaUrlCache.set(key, url);
  objectUrls.push(url);
  return url;
}

const mediaFitStyle = computed(() => ({
  objectFit: current.value?.style?.mediaFit || "contain",
}));

const textStyle = computed(() => {
  const s = current.value?.style || {};
  const hasMedia = !!(mediaUrl("video") || mediaUrl("image"));
  const ay = s.alignY || "center";
  const base: Record<string, string> = {
    color: s.textColor || "#fff",
    fontSize: `${s.fontSize || 64}px`,
    textAlign: s.align || "center",
  };
  if (s.textShadow) {
    const sc = s.textShadowColor || "#000000";
    const sb = s.textShadowBlur ?? 4;
    base.textShadow = `0 0 ${sb}px ${sc}, 0 0 ${sb}px ${sc}`;
  }
  if (hasMedia) {
    // Positioning absolute: top/bottom/transform
    if (ay === "flex-end") {
      base.top = "auto";
      base.bottom = "6vh";
    } else if (ay === "flex-start") {
      base.top = "6vh";
      base.bottom = "auto";
    } else {
      base.top = "50%";
      base.bottom = "auto";
      base.transform = "translateY(-50%)";
    }
  } else {
    base.justifyContent = ay;
  }
  return base;
});

function applyState(payload: unknown): void {
  const packet = stateGate.accept(payload);
  if (!packet) return;
  const previousSession = currentPacket?.announcement_session;
  currentPacket = packet;
  if (!packet.active) {
    slides.value = [];
    clearMediaCache();
    session.value = packet.announcement_session;
    return;
  }
  const newIds = packet.slides.map((s) => s.id).join(",");
  const oldIds = slides.value.map((s) => s.id).join(",");
  if (newIds !== oldIds || previousSession !== packet.announcement_session) {
    clearMediaCache();
  }
  slides.value = packet.slides;
  setSlideIndex(packet.index, packet.announcement_session);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "ArrowRight" || e.key === " ") next();
  else if (e.key === "ArrowLeft") prev();
}

function next(): void {
  if (currentPacket?.active)
    Broadcast.send(BROADCAST_TYPE.ANNOUNCEMENTS_CONTROL, {
      action: "next",
      announcement_session: currentPacket.announcement_session,
    });
}

function prev(): void {
  if (currentPacket?.active)
    Broadcast.send(BROADCAST_TYPE.ANNOUNCEMENTS_CONTROL, {
      action: "prev",
      announcement_session: currentPacket.announcement_session,
    });
}

useProjectionCloseNotice(PROJECTION_TYPE.ANNOUNCEMENTS);

useBroadcastListener(BROADCAST_TYPE.ANNOUNCEMENTS_STATE, (payload: unknown) => {
  applyState(payload);
});

useBroadcastListener(BROADCAST_TYPE.ANNOUNCEMENTS_POSITION, (payload: unknown) => {
  const packet = stateGate.acceptPosition(payload);
  if (packet) {
    currentPacket = packet;
    setSlideIndex(packet.index, packet.announcement_session);
  }
});

useBroadcastListener(BROADCAST_TYPE.ANNOUNCEMENTS_CONTROL, (payload: unknown) => {
  const data = payload as { action?: string; announcement_session?: string } | null;
  if (data?.action === "stop" && data.announcement_session === currentPacket?.announcement_session)
    window.close();
});

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  Broadcast.send(BROADCAST_TYPE.REQUEST_ANNOUNCEMENTS_STATE);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  for (const u of objectUrls) URL.revokeObjectURL(u);
});
</script>

<style scoped>
.ann-root {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Base neutra quando não há slide — o fundo do deck é do .ann-slide */
  background: #000;
}
.ann-stage {
  position: relative;
  width: 100%;
  height: 100%;
  perspective: 1200px;
}
.ann-slide {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ann-media {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.ann-text {
  width: 100%;
  padding: 6vh 6vw;
  font-family: inherit;
  font-weight: 700;
  white-space: pre-wrap;
}
.ann-text--over-media {
  position: absolute;
  left: 0;
  z-index: 10;
  pointer-events: none;
}
.ann-empty {
  flex: 1;
}

/* ─── Transições ───────────────────────────────────────────────────────
   "ann-none" (padrão) não tem regra: as classes entram, nada anima e a
   troca é instantânea. `--trans-dur` e os parâmetros vêm da stage. */

/* Fade — estilo do fade por vars: desfoque, janela separada ("através do
   fundo", com delay na entrada) e deslocamento vertical. */
.ann-fade-enter-active {
  transition:
    opacity var(--trans-dur) var(--trans-ease) var(--fade-delay),
    filter var(--trans-dur) var(--trans-ease) var(--fade-delay),
    transform var(--trans-dur) var(--trans-ease) var(--fade-delay);
}
.ann-fade-leave-active {
  transition:
    opacity var(--trans-dur) var(--trans-ease),
    filter var(--trans-dur) var(--trans-ease),
    transform var(--trans-dur) var(--trans-ease);
}
.ann-fade-enter-from {
  opacity: 0;
  filter: blur(var(--fade-blur));
  transform: translateY(var(--fade-y));
}
.ann-fade-leave-to {
  opacity: 0;
  filter: blur(calc(var(--fade-blur) / 2));
  transform: translateY(calc(var(--fade-y) * -1));
}

/* Zoom — escala e origem configuráveis */
.ann-zoom-enter-active,
.ann-zoom-leave-active {
  transition:
    opacity var(--trans-dur) var(--trans-ease),
    transform var(--trans-dur) var(--trans-ease);
}
.ann-zoom-enter-active,
.ann-zoom-enter-from {
  transform-origin: var(--zoom-origin);
}
.ann-zoom-enter-from {
  opacity: 0;
  transform: scale(var(--zoom-from));
}
.ann-zoom-leave-to {
  opacity: 0;
}

/* Deslizar — entra por --ent-x/--ent-y, sai por --lv-x/--lv-y */
.ann-slide-enter-active,
.ann-slide-leave-active {
  transition: transform var(--trans-dur) var(--trans-ease);
}
.ann-slide-enter-from {
  transform: translate(var(--ent-x), var(--ent-y));
}
.ann-slide-leave-to {
  transform: translate(var(--lv-x), var(--lv-y));
}

/* Cortina — clip-path sempre definido na base para interpolabilidade */
.ann-wipe-enter-active,
.ann-wipe-leave-active {
  clip-path: inset(0);
  transition: clip-path var(--trans-dur) var(--trans-ease);
}
.ann-wipe-enter-from {
  clip-path: var(--wipe-enter);
}
.ann-wipe-leave-to {
  clip-path: var(--wipe-leave);
}

/* Girar — eixo e sentido por var, com perspectiva na stage */
.ann-flip-enter-active,
.ann-flip-leave-active {
  transition: transform var(--trans-dur) var(--trans-ease);
}
.ann-flip-enter-from {
  transform: var(--flip-enter);
}
.ann-flip-leave-to {
  transform: var(--flip-leave);
}

/* Círculo — iris que abre/fecha da origem escolhida */
.ann-circle-enter-active,
.ann-circle-leave-active {
  clip-path: circle(150% at var(--circle-pos));
  transition: clip-path var(--trans-dur) var(--trans-ease);
}
.ann-circle-enter-from,
.ann-circle-leave-to {
  clip-path: circle(0% at var(--circle-pos));
}

/* Dividido — abre/fecha do centro (horizontal ou vertical) */
.ann-split-enter-active,
.ann-split-leave-active {
  clip-path: inset(0);
  transition: clip-path var(--trans-dur) var(--trans-ease);
}
.ann-split-enter-from,
.ann-split-leave-to {
  clip-path: var(--split-enter);
}
</style>
