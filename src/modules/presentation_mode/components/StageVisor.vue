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
    <div v-else class="pm-visor__frame"><LiveMirror :cleared="false" /></div>
  </div>
</template>

<script setup lang="ts">
import { LjIcon } from "@/components/ui";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import { useModuleI18n } from "@/composables/useModuleI18n";
import LiveMirror from "./LiveMirror.vue";

/**
 * Visor do centro para o que não tem grade (vídeo, imagem, versículo,
 * anúncio): o espelho da tela principal, no maior 16:9 que cabe. Os
 * controles ficam na barra de baixo, a mesma para toda mídia.
 */

defineProps<{
  /** Com título, é áudio: sem imagem, nada nas saídas. */
  audioTitle?: string;
}>();

const { tm } = useModuleI18n(ModuleEnum.PRESENTATION_MODE);
</script>

<style scoped>
.pm-visor {
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
