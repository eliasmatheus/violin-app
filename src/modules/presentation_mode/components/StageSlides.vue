<template>
  <div class="pm-slides" data-testid="pm-stage-slides">
    <div class="pm-slides__grid" :class="{ 'pm-slides__grid--locked': locked }">
      <button
        v-for="(slide, i) in slides.slides.value"
        :key="i"
        type="button"
        class="pm-slide-card"
        :class="{
          'pm-slide-card--live': i === index,
          'pm-slide-card--next': i === index + 1,
        }"
        :disabled="locked"
        :aria-current="i === index ? 'true' : undefined"
        :data-testid="`pm-slide-${i}`"
        @click="goTo(i)"
      >
        <span class="pm-slide-card__frame">
          <Slide :slide="slide" :title="slides.title.value" />
        </span>
        <span class="pm-slide-card__foot">
          <span class="pm-slide-card__n">{{ i + 1 }}</span>
          <span v-if="i === 0" class="pm-slide-card__part">{{ tm("stage.cover") }}</span>
        </span>
      </button>
    </div>

    <footer class="pm-slides__bar">
      <LjButton
        variant="primary"
        icon-only
        class="pm-slides__play"
        :icon="audio.isPaused.value ? ICONS.PLAYER.PLAY : ICONS.PLAYER.PAUSE"
        :title="audio.isPaused.value ? tm('stage.play') : tm('stage.pause')"
        :disabled="!hasAudio"
        data-testid="pm-slides-play"
        @click="togglePlay"
      />
      <div class="pm-slides__text">
        <span class="pm-slides__title">{{ slides.title.value }}</span>
        <span v-if="subtitle" class="pm-slides__subtitle">{{ subtitle }}</span>
      </div>
      <template v-if="hasAudio">
        <span class="pm-slides__time">{{ clock(audio.currentTime.value) }}</span>
        <div class="pm-slides__progress" role="presentation">
          <span :style="{ width: `${audio.progress.value}%` }" />
        </div>
        <span class="pm-slides__time">{{ clock(audio.duration.value) }}</span>
      </template>
      <div class="pm-slides__pager">
        <LjButton
          size="sm"
          icon-only
          :icon="ICONS.ACTIONS.PREVIOUS"
          :title="tm('outputs.previous')"
          :disabled="locked || index <= 0"
          @click="Media.prevSlide()"
        />
        <span class="pm-slides__counter" data-testid="pm-slides-counter">{{ index + 1 }} / {{ total }}</span>
        <LjButton
          size="sm"
          icon-only
          :icon="ICONS.ACTIONS.NEXT"
          :title="tm('outputs.next')"
          :disabled="locked || index >= total - 1"
          @click="Media.nextSlide()"
        />
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import Slide from "@/components/Slide.vue";
import { LjButton } from "@/components/ui";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import { KEYS } from "@/constants/UserDataKeys";
import $appdata from "@/helpers/AppData";
import Media from "@/composables/useMedia";
import { useSlides } from "@/composables/useSlides";
import { useAudioPlayback } from "@/composables/useAudioPlayback";
import { useModuleI18n } from "@/composables/useModuleI18n";

/**
 * Grade de slides da música no ar. Cada miniatura é o `Slide.vue` real, com a
 * fonte e o posicionamento da projeção; clicar leva a projeção àquele slide
 * (com áudio, a música pula para o tempo do slide).
 */

const props = defineProps<{
  /** Subtítulo do item do programa (coletânea, versão). */
  subtitle?: string;
  /** Saída travada: a tela principal não muda. */
  locked: boolean;
}>();

const { tm } = useModuleI18n(ModuleEnum.PRESENTATION_MODE);
const slides = useSlides();
const audio = useAudioPlayback();

const index = computed(() => slides.slideIndex.value);
const total = computed(() => slides.totalSlides.value);
const hasAudio = computed(() => !!$appdata.get<string>(KEYS.MODULES.MEDIA.CONFIG.AUDIO, ""));

function goTo(i: number): void {
  if (props.locked) return;
  Media.goToSlide(i);
}

function togglePlay(): void {
  if (audio.isPaused.value) Media.play();
  else Media.pause(true);
}

function clock(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// O slide no ar fica sempre à vista, mesmo quando a música avança sozinha.
watch(index, async (i) => {
  await nextTick();
  document
    .querySelector(`[data-testid="pm-slide-${i}"]`)
    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
});
</script>

<style scoped>
.pm-slides {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pm-slides__grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  /* A letra tem piso de 18px no Slide.vue: abaixo de 168px a miniatura estoura. */
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 12px;
  align-content: start;
}

.pm-slide-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--lj-white-alpha-50);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pm-slide-card:disabled {
  cursor: not-allowed;
}

.pm-slide-card__frame {
  display: block;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 3px;
  outline: 1px solid var(--lj-surface-border);
  transition: outline-color 120ms var(--lj-ease);
}

.pm-slide-card:hover:not(:disabled) .pm-slide-card__frame {
  outline-color: var(--lj-navy-active);
}

.pm-slide-card--next .pm-slide-card__frame {
  outline: 2px solid var(--lj-navy-active);
}

.pm-slide-card--live .pm-slide-card__frame {
  outline: 2px solid var(--lj-orange);
}

.pm-slide-card:focus-visible {
  outline: none;
}

.pm-slide-card:focus-visible .pm-slide-card__frame {
  box-shadow: var(--lj-ui-focus);
}

.pm-slide-card__foot {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}

.pm-slide-card__n {
  font-family: var(--lj-font-mono);
  font-size: 10.5px;
}

.pm-slide-card__part {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.pm-slides__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 8px;
  flex-shrink: 0;
  background: var(--lj-surface-bg);
  border-top: 1px solid var(--lj-surface-border);
  color: var(--lj-text);
}

.pm-slides__play {
  flex-shrink: 0;
}

.pm-slides__text {
  flex: 1 1 auto;
  min-width: 60px;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.pm-slides__title {
  font-weight: var(--lj-weight-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-slides__subtitle {
  font-size: 10.5px;
  color: var(--lj-text-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-slides__time {
  flex-shrink: 0;
  min-width: 30px;
  font-family: var(--lj-font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--lj-text-muted);
}

.pm-slides__progress {
  flex: 0 1 160px;
  min-width: 40px;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--lj-surface-border);
}

.pm-slides__progress span {
  display: block;
  height: 100%;
  background: var(--lj-navy-active);
}

.pm-slides__pager {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.pm-slides__counter {
  min-width: 52px;
  text-align: center;
  font-family: var(--lj-font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
