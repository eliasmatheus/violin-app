<template>
  <footer class="pm-lvideo" data-testid="pm-live-video">
    <span class="pm-lvideo__pill">{{ tm("stage.on_air") }}</span>
    <span class="pm-lvideo__title" :title="title">{{ title }}</span>
    <LjButton
      variant="primary"
      icon-only
      :icon="transport.playing.value ? ICONS.PLAYER.PAUSE : ICONS.PLAYER.PLAY"
      :title="transport.playing.value ? tm('stage.pause') : tm('stage.play')"
      :disabled="locked"
      data-testid="pm-live-video-play"
      @click="transport.togglePlay()"
    />
    <LjButton
      icon-only
      :icon="ICONS.PLAYER.REWIND_10"
      :title="tm('video.back_10')"
      :disabled="locked"
      data-testid="pm-live-video-back"
      @click="transport.seekBy(-10)"
    />
    <LjButton
      icon-only
      :icon="ICONS.PLAYER.FORWARD_10"
      :title="tm('video.forward_10')"
      :disabled="locked"
      data-testid="pm-live-video-forward"
      @click="transport.seekBy(10)"
    />
    <span class="pm-lvideo__time">{{ DateTime.shortTime(transport.currentTime.value) }}</span>
    <LjSlider
      class="pm-lvideo__timeline"
      :model-value="transport.currentTime.value"
      :min="0"
      :max="transport.duration.value || 1"
      :step="0.1"
      :disabled="locked || !transport.duration.value"
      :aria-label="tm('video.timeline')"
      data-testid="pm-live-video-timeline"
      @update:model-value="(t: number) => transport.seekTo(t)"
    />
    <span class="pm-lvideo__remaining">
      −{{ DateTime.shortTime(remaining) }}
      <span class="pm-lvideo__ends">{{ tm("video.ends_at", { time: endsAt }) }}</span>
    </span>
  </footer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { LjButton, LjSlider } from "@/components/ui";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import DateTime from "@/helpers/DateTime";
import { useModuleI18n } from "@/composables/useModuleI18n";
import type { useLiveTransport } from "../composables/useLiveTransport";

/**
 * O tempo do vídeo (ou áudio) que está no ar como parte de uma pasta ou de
 * um momento. A barra de baixo anda pelos arquivos; esta faixa, logo acima,
 * é o player do arquivo da vez — como a do vídeo só no retorno. O som fica
 * na barra de baixo, que é a mesma para toda mídia.
 */

const props = defineProps<{
  transport: ReturnType<typeof useLiveTransport>;
  title: string;
  locked: boolean;
}>();

const { tm, locale } = useModuleI18n(ModuleEnum.PRESENTATION_MODE);

const remaining = computed(() =>
  Math.max(0, props.transport.duration.value - props.transport.currentTime.value)
);
const now = ref(Date.now());
const clock = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(clock));
const endsAt = computed(() =>
  new Date(now.value + remaining.value * 1000).toLocaleTimeString(locale.value, {
    hour: "2-digit",
    minute: "2-digit",
  })
);
</script>

<style scoped>
.pm-lvideo {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 48px;
  padding: 0 8px;
  flex-shrink: 0;
  background: var(--lj-surface-bg);
  border-top: 2px solid var(--lj-orange);
  color: var(--lj-text);
}

.pm-lvideo > * {
  flex-shrink: 0;
}

.pm-lvideo__pill {
  padding: 1px 6px;
  border-radius: 2px;
  background: var(--lj-danger);
  color: var(--lj-white);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
}

.pm-lvideo__title {
  flex-shrink: 1;
  min-width: 40px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: var(--lj-weight-semibold);
}

.pm-lvideo__time {
  font-family: var(--lj-font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--lj-text-muted);
}

.pm-lvideo__timeline {
  flex: 1 1 auto;
  min-width: 60px;
}

.pm-lvideo__remaining {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.15;
  font-family: var(--lj-font-mono);
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pm-lvideo__ends {
  font-size: 10px;
  font-weight: 400;
  color: var(--lj-text-muted);
}
</style>
