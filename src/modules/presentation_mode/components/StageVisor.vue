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
      data-testid="pm-visor-frame"
      @wheel="onWheel"
      @pointerdown="startPan"
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
  const at = box
    ? { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }
    : undefined;
  zoom.zoomBy(Math.exp(-e.deltaY * 0.0015), at);
}

function startPan(e: PointerEvent): void {
  if (zoom.scale.value <= 1) return;
  const box = mediaBox();
  if (!box) return;
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  let lastX = e.clientX;
  let lastY = e.clientY;
  const move = (ev: PointerEvent) => {
    zoom.panBy((ev.clientX - lastX) / box.width, (ev.clientY - lastY) / box.height);
    lastX = ev.clientX;
    lastY = ev.clientY;
  };
  const end = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
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

.pm-visor__frame--zoomed {
  cursor: grab;
  touch-action: none;
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
