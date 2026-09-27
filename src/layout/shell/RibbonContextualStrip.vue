<template>
  <!-- Faixa contextual Violin — o "menu contextual" do módulo, montado no
       topo do painel (logo abaixo das abas de módulo, acima do #header do
       módulo). Espelha a página contextual que a ribbon clássica mostrava
       como aba: mesmos grupos e ações, renderizados só-ícone com teto de
       70px. Se autogateia no esquema: no clássico ninguém monta — quem
       decide a colocação é o dono do template (ModuleContainer, ou o
       próprio módulo quando não passa pelo container, como a liturgia). -->
  <div v-if="isViolin && pages.length" class="ctx-strip">
    <!-- Módulos com mais de uma página contextual (hoje: Editor de Slides)
         ganham chips de troca à esquerda; um único contexto não precisa. -->
    <div
      v-if="pages.length > 1"
      class="ctx-strip-tabs"
      role="tablist"
      :aria-label="$t('shell.ribbon_nav')"
    >
      <button
        v-for="p in pages"
        :key="p.id"
        type="button"
        role="tab"
        class="ctx-strip-tab"
        :class="{ 'ctx-strip-tab--active': selectedId === p.id }"
        :aria-selected="selectedId === p.id"
        :title="$t(p.title)"
        @click="ribbonStore.selectCtxPage(moduleId, p.id)"
      >
        {{ $t(p.title) }}
      </button>
    </div>

    <RibbonPageBody
      v-if="currentPage"
      variant="strip"
      :groups="currentPage.groups || []"
      :page-key="currentPage.id"
      :page-id="currentPage.id"
      :contextual="true"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RibbonPageBody from "@/layout/shell/RibbonPageBody.vue";
import { useRibbonStore } from "@/stores/ribbonStore";
import { useUiStyle } from "@/composables/useUiStyle";
import type { RibbonPage } from "@/types/Ribbon";

const props = defineProps<{
  /** Módulo dono da faixa — o contexto é derivado dele, não da ribbon. */
  moduleId: string | null;
}>();

const ribbonStore = useRibbonStore();
const { isViolin } = useUiStyle();

const pages = computed(() => ribbonStore.ctxPagesFor(props.moduleId));
const selectedId = computed(() => ribbonStore.selectedCtxPageId(props.moduleId));
const currentPage = computed<RibbonPage | undefined>(() =>
  pages.value.find((p) => p.id === selectedId.value)
);
</script>

<style scoped>
.ctx-strip {
  display: flex;
  align-items: stretch;
  gap: var(--lj-space-2);
  flex-shrink: 0;
  max-height: 70px;
  background: var(--lj-body-bg-ctx);
  border-bottom: 1px solid var(--lj-body-border);
  padding-left: var(--lj-space-3);
  overflow: hidden;
  position: relative;
  z-index: 1;
  font-family: var(--lj-font-shell);
}

.ctx-strip-tabs {
  display: flex;
  align-items: center;
  gap: var(--lj-space-1);
  flex-shrink: 0;
  padding-right: var(--lj-space-2);
  border-right: 1px solid var(--lj-body-divider);
}

.ctx-strip-tab {
  display: flex;
  align-items: center;
  height: 20px;
  padding: 0 var(--lj-space-3);
  border: none;
  background: var(--lj-tabs-ctx-bg);
  border-radius: var(--lj-radius-sm);
  color: var(--lj-tabs-ctx-color);
  font-family: inherit;
  font-size: var(--lj-text-xs);
  font-weight: var(--lj-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
  outline: none;
  transition:
    background var(--lj-transition-fast),
    color var(--lj-transition-fast);
}

.ctx-strip-tab:hover:not(.ctx-strip-tab--active) {
  background: var(--lj-tabs-ctx-hover-bg);
}

.ctx-strip-tab--active {
  background: var(--lj-tabs-active-bg);
  color: var(--lj-orange-darker);
  font-weight: var(--lj-weight-bold);
  box-shadow: inset 0 -2px 0 var(--lj-orange);
}
</style>
