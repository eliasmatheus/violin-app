<template>
  <!-- Lançador de módulos (Violin) — substitui as abas de página da ribbon:
       todos os módulos visíveis viram ícones de 24px numa linha só. Sem a
       barra de abas abertos, quem mostra o que está aberto é aqui: módulo
       aberto ganha preenchimento e o que está na tela ganha outro destaque.
       Botão direito num ícone aberto oferece Fechar. -->
  <div class="launcher" role="group" :aria-label="$t('shell.ribbon_nav')">
    <button
      v-for="m in items"
      :key="m.id"
      type="button"
      class="launcher-item"
      :class="{
        'launcher-item--open': isOpen(m.id),
        'launcher-item--active': isActive(m.id),
      }"
      :aria-current="isActive(m.id) ? 'true' : undefined"
      :title="t(m.label)"
      :aria-label="t(m.label)"
      :data-testid="`launcher-${m.id}`"
      @click="open(m.id)"
      @contextmenu.prevent="onContextMenu($event, m)"
    >
      <LjIcon :icon="m.icon" :color="m.color" size="24" aria-hidden="true" />
    </button>

    <!-- Teleportado ao body: o lançador tem overflow-x e cortaria o menu. -->
    <Teleport to="body">
      <div
        v-if="menu"
        ref="menuEl"
        class="launcher-menu lj-ui-float"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
        role="menu"
      >
        <button
          type="button"
          class="launcher-menu__item"
          role="menuitem"
          :data-testid="`launcher-close-${menu.id}`"
          @click="closeFromMenu"
        >
          <LjIcon :icon="ICONS.ACTIONS.CLOSE" size="14" aria-hidden="true" />
          {{ $t("alert.close") }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { LjIcon } from "@/components/ui";
import { ICONS } from "@/config/Icons";
import $appdata from "@/helpers/AppData";
import $modules from "@/helpers/Modules";
import { getRibbonModules, isModuleVisible } from "@/config/modules";

const { t } = useI18n();

interface LauncherItem {
  id: string;
  icon: string;
  color?: string;
  label: string;
}

/**
 * Mesma ordem da ribbon clássica (categoria → grupo → módulo), com o filtro
 * de visibilidade do operador — o lançador é a ribbon inteira achatada em
 * uma linha, então quem some da ribbon some daqui.
 */
const items = computed<LauncherItem[]>(() => {
  const seen = new Set<string>();
  const out: LauncherItem[] = [];
  for (const page of getRibbonModules) {
    if (page.contextual) continue;
    for (const group of page.groups || []) {
      for (const btn of group.buttons || []) {
        const id = btn.module;
        if (!id || seen.has(id) || !isModuleVisible(id)) continue;
        seen.add(id);
        out.push({ id, icon: btn.icon || "", color: btn.color, label: btn.label });
      }
    }
  }
  return out;
});

function isActive(id: string): boolean {
  return $appdata.get("active_module") === id;
}

/** Aberto = visível em algum lugar (embedded ou popup), mesmo que não focado. */
function isOpen(id: string): boolean {
  const modules = ($appdata.get("modules") || {}) as Record<string, { show?: boolean }>;
  return modules[id]?.show === true;
}

function open(id: string): void {
  $modules.open(id);
}

/* ── Menu de contexto (botão direito) ────────────────────────────────
 * Só existe para módulo aberto: fechar é a única ação que faz sentido
 * quando a barra de abas abertos não está no Violin. */
interface ContextMenu {
  id: string;
  x: number;
  y: number;
}

const menu = ref<ContextMenu | null>(null);
const menuEl = ref<HTMLElement | null>(null);

function onContextMenu(event: MouseEvent, item: LauncherItem): void {
  if (!isOpen(item.id)) {
    menu.value = null;
    return;
  }
  // Prega o menu na viewport: canto inferior-direiro não estoura a tela.
  const x = Math.max(4, Math.min(event.clientX, window.innerWidth - 160));
  const y = Math.max(4, Math.min(event.clientY, window.innerHeight - 48));
  menu.value = { id: item.id, x, y };
}

function closeFromMenu(): void {
  if (!menu.value) return;
  $modules.close(menu.value.id);
  menu.value = null;
}

function onGlobalPointerDown(event: Event): void {
  if (!menu.value) return;
  const el = menuEl.value;
  if (el && event.target instanceof Node && !el.contains(event.target)) {
    menu.value = null;
  }
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") menu.value = null;
}

onMounted(() => {
  window.addEventListener("pointerdown", onGlobalPointerDown, true);
  window.addEventListener("keydown", onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onGlobalPointerDown, true);
  window.removeEventListener("keydown", onGlobalKeydown);
});
</script>

<style scoped>
.launcher {
  display: flex;
  align-items: center;
  gap: var(--lj-space-2);
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 var(--lj-space-2);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  font-family: var(--lj-font-shell);
}

.launcher::-webkit-scrollbar {
  display: none;
}

.launcher-item {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--lj-radius-md);
  color: var(--lj-text);
  cursor: pointer;
  outline: none;
  transition:
    background var(--lj-transition-fast),
    box-shadow var(--lj-transition-fast);
}

.launcher-item:hover {
  background: var(--lj-hover-bg);
}

.launcher-item:focus-visible {
  box-shadow: var(--lj-ui-focus);
}

/* Aberto e fora da tela: só o preenchimento marca presença. */
.launcher-item--open {
  background: var(--lj-surface-bg-active);
}

/* Na tela: preenchimento próprio + filete laranja — o segundo destaque
   separa o módulo ativo dos demais abertos. A regra fica depois de --open
   para o fundo vencer quando os dois puderem valer. */
.launcher-item--active {
  background: var(--lj-tabs-active-bg);
  box-shadow: inset 0 -2px 0 var(--lj-orange);
}

.launcher-menu {
  position: fixed;
  z-index: 900;
  min-width: 150px;
  padding: var(--lj-space-1);
  font-family: var(--lj-font-shell);
}

.launcher-menu__item {
  display: flex;
  align-items: center;
  gap: var(--lj-space-3);
  width: 100%;
  padding: var(--lj-space-2) var(--lj-space-3);
  border: none;
  background: transparent;
  border-radius: var(--lj-radius-sm);
  color: var(--lj-text);
  font-family: inherit;
  font-size: var(--lj-text-base);
  cursor: pointer;
  outline: none;
  transition: background var(--lj-transition-fast);
}

.launcher-menu__item:hover {
  background: var(--lj-hover-bg);
}

.launcher-menu__item:focus-visible {
  box-shadow: var(--lj-ui-focus);
}
</style>
