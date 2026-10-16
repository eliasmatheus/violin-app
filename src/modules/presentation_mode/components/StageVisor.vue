<template>
  <div class="pm-visor" data-testid="pm-stage-preview">
    <!-- Áudio não vai para as saídas: o visor mostra só o que está tocando. -->
    <div
      v-if="audioTitle !== undefined"
      class="pm-visor__frame pm-visor__audio"
      data-testid="pm-stage-audio"
    >
      <LjIcon :icon="ICONS.MUSIC.AUDIO" :size="48" />
      <span class="pm-visor__audio-title">{{ audioTitle }}</span>
      <span class="pm-visor__audio-hint">{{ tm("video.audio_only") }}</span>
    </div>
    <!-- Imagem ou PDF no ar: roda do mouse amplia no ponto, arrastar move o recorte. -->
    <div
      v-else
      ref="frame"
      class="pm-visor__frame"
      :class="{
        'pm-visor__frame--zoomable': zoomable,
        'pm-visor__frame--zoomed': zoom.scale.value > 1,
      }"
      :title="zoomable ? tm('zoom_live.visor_hint') : undefined"
      data-testid="pm-visor-frame"
      @wheel="onWheel"
      @pointerdown="startPointer"
      @dragstart.prevent
    >
      <LiveMirror :cleared="false" />
    </div>
    <ZoomControls v-if="zoomable" />
  </div>
</template>

<script setup lang="ts">
import { LjIcon } from "@/components/ui";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import { useModuleI18n } from "@/composables/useModuleI18n";
import { computed, ref } from "vue";
import LiveMirror from "./LiveMirror.vue";
import ZoomControls from "./ZoomControls.vue";
import { useLiveZoom } from "../composables/useLiveZoom";

/**
 * Visor do centro para o que não tem grade (vídeo, imagem, versículo,
 * anúncio): o espelho da tela principal, no maior 16:9 que cabe. Os
 * controles ficam na barra de baixo, a mesma para toda mídia.
 */

const { tm } = useModuleI18n(ModuleEnum.PRESENTATION_MODE);

const props = defineProps<{ audioTitle?: string }>();
const zoom = useLiveZoom();
const zoomable = computed(() => props.audioTitle === undefined && !!zoom.target.value);
const frame = ref<HTMLElement | null>(null);

/**
 * A caixa da mídia sem o zoom (o `offset*` ignora o transform): a imagem
 * ocupa o 16:9 inteiro; a página do PDF, só a caixa dela.
 */
function mediaBox(): DOMRect | null {
  const mirror = frame.value?.querySelector<HTMLElement>(".pm-mirror");
  const media = mirror?.querySelector<HTMLElement>(".pm-mirror__page, .pm-mirror__media");
  if (!mirror || !media) return null;
  const r = mirror.getBoundingClientRect();
  return new DOMRect(
    r.left + media.offsetLeft,
    r.top + media.offsetTop,
    media.offsetWidth,
    media.offsetHeight
  );
}

function onWheel(e: WheelEvent): void {
  if (!zoomable.value) return;
  e.preventDefault();
  const box = mediaBox();
  const at = box ? pointAt(box, e.clientX, e.clientY) : undefined;
  zoom.zoomBy(Math.exp(-e.deltaY * 0.0015), at);
}

/** Menos que isso entre apertar e soltar é clique, não arraste. */
const CLICK_SLOP = 4;

function pointAt(box: DOMRect, x: number, y: number): { x: number; y: number } {
  return { x: (x - box.left) / box.width, y: (y - box.top) / box.height };
}

/**
 * Clique amplia no ponto (Alt+clique reduz); com zoom, arrastar move o
 * recorte. O `dragstart` da imagem é cancelado no elemento: o arrastar nativo
 * do navegador cancelaria o ponteiro no primeiro movimento.
 */
function startPointer(e: PointerEvent): void {
  if (!zoomable.value || e.button !== 0) return;
  const box = mediaBox();
  if (!box) return;
  e.preventDefault();
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startY = e.clientY;
  let lastX = startX;
  let lastY = startY;
  let dragging = false;
  const move = (ev: PointerEvent) => {
    if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < CLICK_SLOP) return;
    dragging = true;
    if (zoom.scale.value > 1) {
      zoom.panBy((ev.clientX - lastX) / box.width, (ev.clientY - lastY) / box.height);
    }
    lastX = ev.clientX;
    lastY = ev.clientY;
  };
  const end = (ev: PointerEvent) => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    if (dragging || ev.type === "pointercancel") return;
    const at = pointAt(box, startX, startY);
    if (e.altKey) zoom.zoomOut(at);
    else zoom.zoomIn(at);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
</script>

<style scoped>
.pm-visor {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  container-type: size;
}

/* O maior 16:9 que cabe no palco, sem sobrepor a biblioteca. */
.pm-visor__frame {
  width: min(100cqw, calc(100cqh * 16 / 9));
}

.pm-visor__frame--zoomable {
  cursor: zoom-in;
}

.pm-visor__frame--zoomable {
  touch-action: none;
  user-select: none;
}

.pm-visor__frame--zoomed {
  cursor: grab;
}

.pm-visor__frame--zoomed:active {
  cursor: grabbing;
}

/* A imagem não é alvo: o arrastar nativo dela roubaria o ponteiro do pan. */
.pm-visor__frame--zoomable :deep(img) {
  pointer-events: none;
  -webkit-user-drag: none;
}

.pm-visor__audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--lj-space-3);
  aspect-ratio: 16 / 9;
  border: 1px dashed var(--lj-surface-border-strong);
  border-radius: var(--lj-radius-sm);
  color: var(--lj-white-alpha-50);
  text-align: center;
}

.pm-visor__audio-title {
  max-width: 90%;
  font-size: 18px;
  font-weight: var(--lj-weight-semibold);
  color: var(--lj-white);
  overflow-wrap: anywhere;
}

.pm-visor__audio-hint {
  font-size: 11px;
}
</style>
