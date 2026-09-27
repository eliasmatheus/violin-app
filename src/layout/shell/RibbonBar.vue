<template>
  <div class="ribbon" :class="{ 'ribbon--violin': isViolin }">
    <!-- Linha de tabs: só no web/PWA (desktop usa SystemBar) -->
    <template v-if="!Platform.isDesktop">
      <div class="ribbon-tabs-row">
        <AppMenu class="ribbon-app-menu" />

        <div class="ribbon-tabs-wrap">
          <!-- Violin: as abas de página saem do Shell e o lugar delas é o
               lançador — todos os módulos visíveis como ícones de uma vez. -->
          <ModuleLauncher v-if="isViolin" />
          <RibbonTabs
            v-else
            id-prefix="ribbon"
            style="
              --rtab-padding-x: var(--lj-space-6);
              --rtab-font-size: var(--lj-text-md);
              --rtab-font-weight: var(--lj-weight-medium);
            "
          />
        </div>

        <div class="ribbon-tools">
          <div class="ribbon-tools-web">
            <ShellTools />
          </div>
        </div>
      </div>
    </template>

    <!-- Violin no desktop: não existe linha de abas — o lançador ganha a
         linha sozinho, com o mesmo acabamento dela. -->
    <div v-if="isViolin && Platform.isDesktop" class="ribbon-tabs-row">
      <div class="ribbon-tabs-wrap">
        <ModuleLauncher />
      </div>
    </div>

    <RibbonPageBody
      v-if="!isViolin"
      :groups="activePageObj?.groups || []"
      :page-key="ribbonStore.activePage"
      :page-id="ribbonStore.activePage"
      :contextual="isContextualActive"
      panel-id="ribbon-tabpanel"
      :aria-labelledby="'ribbon-tab-' + ribbonStore.activePage"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Ribbon — chrome (linha de abas + tools) e seleção de página.
 *
 * No clássico: linha de abas de página + RibbonPageBody (grupos de módulos).
 * No Violin: as abas de página e o corpo somem; o lugar vira o
 * ModuleLauncher — todos os módulos visíveis como ícones de 24px numa linha.
 * O renderizador dos grupos mora no RibbonPageBody, que também serve a
 * faixa contextual (RibbonContextualStrip).
 */
import { computed, type ComputedRef, watch } from "vue";
import AppMenu from "./AppMenu.vue";
import ShellTools from "./ShellTools.vue";
import ModuleLauncher from "./ModuleLauncher.vue";
import RibbonPageBody from "@/layout/shell/RibbonPageBody.vue";
import RibbonTabs from "@/components/RibbonTabs.vue";
import { useBroadcastListener } from "@/composables/useBroadcastListener";
import { useRibbonStore } from "@/stores/ribbonStore";
import { useUiStyle } from "@/composables/useUiStyle";
import Platform from "@/helpers/Platform";
import $appdata from "@/helpers/AppData";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { getRibbonModules } from "@/config/modules";
import type { RibbonPage } from "@/types/Ribbon";

const modules: RibbonPage[] = getRibbonModules;
const ribbonStore = useRibbonStore();
const { isViolin } = useUiStyle();

const openModuleIds: ComputedRef<string[]> = computed(() => {
  const mods = $appdata.get<Record<string, { show?: boolean }>>("modules") || {};
  return Object.keys(mods).filter((id) => mods[id]?.show === true);
});

const activePageObj: ComputedRef<RibbonPage | undefined> = computed(() =>
  modules.find((p: RibbonPage) => p.id === ribbonStore.activePage)
);

const isContextualActive: ComputedRef<boolean> = computed(() => !!activePageObj.value?.contextual);

// Fecha o contexto quando o último módulo que o sustentava sai.
watch(openModuleIds, (now: string[]) => {
  const cur = activePageObj.value;
  if (cur?.contextual) {
    const stillVisible = (cur.activeOnModules || []).some((id: string) => now.includes(id));
    if (!stillVisible) {
      ribbonStore.selectPage("collections");
    }
  }
});

watch(
  computed(() => $appdata.get<string | null>("active_module")),
  (moduleId: string | null) => {
    ribbonStore.selectContextualPageForModule(moduleId);
  }
);

// Trocar para Violin com uma página contextual selecionada devolve a ribbon
// para uma página de lançamento: em Violin o contexto mora na faixa do
// módulo e a store passa a rotear seleções contextuais para lá.
watch(
  isViolin,
  (violin) => {
    if (violin && activePageObj.value?.contextual) {
      ribbonStore.selectPage("collections");
    }
  },
  { immediate: true }
);

useBroadcastListener(BROADCAST_TYPE.RIBBON_SELECT_PAGE, (payload: unknown) => {
  const p = payload as { pageId?: string } | null;
  if (p?.pageId) {
    ribbonStore.selectPage(p.pageId);
  }
});
</script>

<style scoped>
.ribbon {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
  font-family: var(--lj-font-shell);
}

.ribbon-app-menu {
  height: 100%;
}

.ribbon-tabs-row {
  display: flex;
  align-items: stretch;
  height: var(--lj-tab-height);
  background: var(--lj-tabs-bg);
  position: relative;
  z-index: 2;
}

/* Violin: a linha hospeda o lançador (ícones de 24px) e cresce para caber. */
.ribbon--violin .ribbon-tabs-row {
  height: 40px;
}

.ribbon-tabs-wrap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* ============ Toolbar fixa direita ============ */
.ribbon-tools {
  display: flex;
  align-items: stretch;
  padding-right: var(--lj-space-2);
}

.ribbon-tools-web {
  display: flex;
  align-items: stretch;
}
.ribbon-tools-web .shell-tool {
  height: 100%;
  color: var(--lj-tabs-color);
}
.ribbon-tools-web .shell-tool:hover {
  background: var(--lj-tabs-hover-bg);
  color: var(--lj-tabs-color-hover);
}
</style>
