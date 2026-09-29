<template>
  <ModuleContainer :manifest="manifest">
    <div class="pm-area" :class="{ 'pm-area--library-wide': libraryFullWidth }">
      <aside class="pm-program" data-testid="pm-program">
        <header class="pm-bar pm-bar--soft">
          <LjIcon :icon="ICONS.LITURGY.SCRIPT" :size="14" class="pm-bar__accent" />
          <span class="pm-bar__title">{{ tm("panels.program") }}</span>
        </header>
        <div class="pm-panel-body">
          <LjEmpty :icon="ICONS.LITURGY.SCRIPT" :title="tm('empty.program')" />
        </div>
      </aside>

      <section class="pm-stage" data-testid="pm-stage">
        <header class="pm-bar">
          <span class="pm-bar__title">{{ tm("panels.stage") }}</span>
          <div class="pm-bar__tools">
            <LjButton
              size="sm"
              icon-only
              :icon="expanded ? ICONS.PLAYER.FULLSCREEN_EXIT : ICONS.PLAYER.FULLSCREEN"
              :title="expanded ? tm('actions.collapse') : tm('actions.expand')"
              data-testid="pm-toggle-expand"
              @click="toggleExpand"
            />
          </div>
        </header>
        <div class="pm-stage__body">
          <p class="pm-stage__empty">{{ tm("empty.stage") }}</p>
        </div>
      </section>

      <section class="pm-library" data-testid="pm-library">
        <header class="pm-bar">
          <LjIcon :icon="ICONS.UI.FOLDER_OPEN" :size="14" />
          <span class="pm-bar__title">{{ tm("panels.library") }}</span>
        </header>
        <div class="pm-panel-body">
          <LjEmpty :icon="ICONS.UI.FOLDER_OPEN" :title="tm('empty.library')" />
        </div>
      </section>

      <aside class="pm-outputs" data-testid="pm-outputs">
        <header class="pm-bar pm-bar--soft">
          <LjIcon :icon="ICONS.UI.MONITORS" :size="14" />
          <span class="pm-bar__title">{{ tm("panels.outputs") }}</span>
        </header>
        <div class="pm-panel-body">
          <LjEmpty :icon="ICONS.UI.MONITORS" :title="tm('empty.outputs')" />
        </div>
      </aside>
    </div>
  </ModuleContainer>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { LjButton, LjEmpty, LjIcon } from "@/components/ui";
import ModuleContainer from "@/components/ModuleContainer.vue";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { useBroadcastListener } from "@/composables/useBroadcastListener";
import { useModuleI18n } from "@/composables/useModuleI18n";
import { isModuleExpanded, toggleModuleExpanded } from "@/composables/useModuleExpanded";
import { module as manifest } from "../manifest";

const moduleId = ModuleEnum.PRESENTATION_MODE;
const { tm } = useModuleI18n(moduleId);

const expanded = computed(() => isModuleExpanded(moduleId));
// A biblioteca em largura total ganha botão próprio na F5; o grid já prevê o arranjo.
const libraryFullWidth = ref(false);

function toggleExpand(): void {
  toggleModuleExpanded(moduleId);
}

// Todas as ações do ribbon contextual chegam aqui. As que ainda não têm
// handler são ignoradas até a fase que as implementa.
const RIBBON_HANDLERS: Record<string, () => void> = {
  toggle_expand: toggleExpand,
};

useBroadcastListener(BROADCAST_TYPE.MODULE_RIBBON_ACTION, (payload) => {
  const data = payload as { module?: string; action?: string } | null;
  if (data?.module !== moduleId || !data.action) return;
  RIBBON_HANDLERS[data.action]?.();
});
</script>

<style scoped>
/* Tudo encolhe no fluxo: nenhum painel se sobrepõe ao outro. */
.pm-area {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 282px minmax(0, 1fr) 306px;
  grid-template-rows: minmax(150px, 1fr) auto;
  background: var(--lj-live-area-bg);
  font-size: var(--lj-text-md);
}

.pm-area > * {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--lj-surface-bg);
}

.pm-program {
  grid-column: 1;
  grid-row: 1 / 3;
  border-right: 1px solid var(--lj-surface-border);
}

.pm-stage {
  grid-column: 2;
  grid-row: 1;
  background: var(--lj-live-stage-bg);
}

.pm-library {
  grid-column: 2;
  grid-row: 2;
  height: min(244px, 30vh);
  border-top: 1px solid var(--lj-surface-border);
}

.pm-outputs {
  grid-column: 3;
  grid-row: 1 / 3;
  overflow-y: auto;
  border-left: 1px solid var(--lj-surface-border);
}

.pm-area--library-wide .pm-program {
  grid-row: 1;
}

.pm-area--library-wide .pm-library {
  grid-column: 1 / 3;
}

.pm-bar {
  display: flex;
  align-items: center;
  gap: var(--lj-space-3);
  height: 30px;
  padding: 0 var(--lj-space-4);
  flex-shrink: 0;
  background: var(--lj-surface-bg);
  border-bottom: 1px solid var(--lj-surface-border);
  color: var(--lj-text-muted);
}

.pm-bar--soft {
  background: var(--lj-surface-bg-soft);
}

.pm-bar__accent {
  color: var(--lj-orange);
}

.pm-bar__title {
  font-weight: var(--lj-weight-semibold);
  color: var(--lj-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-bar__tools {
  display: flex;
  align-items: center;
  gap: var(--lj-space-1);
  margin-left: auto;
  flex-shrink: 0;
}

.pm-panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--lj-space-4);
}

.pm-stage__body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* O palco é escuro em qualquer tema; o texto não pode seguir o tema. */
.pm-stage__empty {
  margin: 0;
  color: var(--lj-white-alpha-50);
}
</style>
