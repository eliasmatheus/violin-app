<template>
  <ModuleContainer :manifest="manifest">
    <div class="pm-area" :class="{ 'pm-area--library-wide': libraryFullWidth }">
      <ProgramPanel
        @activate="activate"
        @edit-item="openEditItem"
        @edit-session="openEditSession"
        @new-item="openNewItem"
        @import="importFromLiturgy"
        @settings="settingsDialogOpen = true"
      />

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

      <OutputsPanel
        :up-next="upNextItem"
        :up-next-meta="upNextMeta"
        :prepared="!!preparedItemId"
        :locked="outputLocked"
        :can-navigate="canNavigate"
        :flash="upNextFlash"
        @first="navigate('first')"
        @prev="navigate('prev')"
        @next="navigate('next')"
        @last="navigate('last')"
        @toggle-lock="toggleLock"
        @send="sendUpNext"
      />
    </div>

    <ProgramItemDialog
      v-model="itemDialogOpen"
      :item="editingItem"
      :session-id="editingSessionId"
      :sessions="program.sessions"
      @save="onSaveItem"
      @remove="confirmRemoveItem(editingItem?.id ?? null)"
    />
    <ProgramSessionDialog
      v-model="sessionDialogOpen"
      :initial-label="editingSession?.label ?? null"
      @save="onSaveSession"
      @remove="confirmRemoveSession"
    />
    <ProgramSettingsDialog
      v-model="settingsDialogOpen"
      :planned-start="program.plannedStart"
      @save="setPlannedStart"
    />
  </ModuleContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { LjButton, LjEmpty, LjIcon } from "@/components/ui";
import ModuleContainer from "@/components/ModuleContainer.vue";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import { DB_TABLE } from "@/constants/DbTables";
import $alert from "@/helpers/Alert";
import $idb from "@/helpers/IndexedDB";
import $liturgy from "@/helpers/Liturgy";
import Telemetry from "@/helpers/Telemetry";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { useBroadcastListener } from "@/composables/useBroadcastListener";
import { useModuleI18n } from "@/composables/useModuleI18n";
import { isModuleExpanded, toggleModuleExpanded } from "@/composables/useModuleExpanded";
import { useLiturgyLibrary } from "@/modules/liturgy/composables/useLiturgyLibrary";
import type { ProgramItem, ProgramSession } from "@/types/Presentation";
import ProgramPanel from "./ProgramPanel.vue";
import ProgramItemDialog from "./ProgramItemDialog.vue";
import ProgramSessionDialog from "./ProgramSessionDialog.vue";
import ProgramSettingsDialog from "./ProgramSettingsDialog.vue";
import OutputsPanel from "./OutputsPanel.vue";
import Media from "@/composables/useMedia";
import { useSlides } from "@/composables/useSlides";
import { useLiveContent } from "../composables/useLiveContent";
import { cleared, setCleared, startOutputs, stopOutputs } from "../composables/useOutputs";
import { formatHHMM, plannedStarts } from "../program/time";
import { newId, useProgram } from "../composables/useProgram";
import { useProgramExecution } from "../composables/useProgramExecution";
import { importLiturgy, programToLiturgy } from "../program/liturgy";
import { module as manifest } from "../manifest";

const moduleId = ModuleEnum.PRESENTATION_MODE;
const { tm } = useModuleI18n(moduleId);
/** O `$alert` traduz na hora de pintar: recebe a chave, não o texto. */
const alertKey = (key: string) => `modules.${moduleId}.${key}`;

const {
  date,
  program,
  selectedItemId,
  ensureLoaded,
  setSessions,
  setPlannedStart,
  addSession,
  updateSession,
  removeSession,
  addItem,
  updateItem,
  duplicateItem,
  removeItem,
  sessionOf,
  goLive,
  toggleOpen,
  preparedItemId,
  upNextItem,
  outputLocked,
  setOutputLocked,
  prepare,
} = useProgram();
const { execute } = useProgramExecution();

onMounted(() => {
  void ensureLoaded();
  // A trava vale para o culto em andamento, não para a próxima abertura.
  if (outputLocked.value) setOutputLocked(false);
});

const expanded = computed(() => isModuleExpanded(moduleId));
// A biblioteca em largura total ganha botão próprio na F5; o grid já prevê o arranjo.
const libraryFullWidth = ref(false);

function toggleExpand(): void {
  toggleModuleExpanded(moduleId);
}

/* ─── Ao vivo ─── */

function findItem(itemId: string): ProgramItem | null {
  for (const session of program.value.sessions) {
    const item = session.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
}

/**
 * Duplo clique: o item entra no ar e é executado. Item com sub-itens só abre
 * a lista e espera o operador escolher — nada vai para a tela.
 */
function activate(itemId: string, { force = false } = {}): void {
  const item = findItem(itemId);
  if (!item) return;
  if (item.children?.length) {
    toggleOpen(item.id, true);
    return;
  }
  // Saída travada: a tela principal fica como está e o item espera na fila.
  if (outputLocked.value && !force) {
    prepare(item.id);
    return;
  }
  goLive(item.id);
  execute(item);
  Telemetry.track("presentation_item_live", { kind: item.kind });
}

/* ─── Saídas ─── */

const slides = useSlides();
const { current: liveKind } = useLiveContent();

/** Há partes para percorrer: os slides da música que está no ar. */
const canNavigate = computed(
  () => !outputLocked.value && liveKind.value === "music" && slides.totalSlides.value > 0
);

const upNextFlash = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | null = null;
function flashUpNext(): void {
  upNextFlash.value = true;
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (upNextFlash.value = false), 700);
}

/**
 * Próximo avança a parte do item no ar. Na última parte — ou num item sem
 * partes — não pula de item sozinho: destaca "A seguir", que o operador envia.
 */
function navigate(to: "first" | "prev" | "next" | "last"): void {
  if (outputLocked.value) return;
  if (!canNavigate.value) {
    if (to === "next") flashUpNext();
    return;
  }
  const last = slides.totalSlides.value - 1;
  if (to === "next" && slides.slideIndex.value >= last) {
    flashUpNext();
    return;
  }
  if (to === "first") Media.firstSlide();
  else if (to === "prev") Media.prevSlide();
  else if (to === "next") Media.nextSlide();
  else Media.lastSlide();
}

const upNextMeta = computed(() => {
  const item = upNextItem.value;
  if (!item) return "";
  const start = plannedStarts(program.value).get(item.id);
  return [item.subtitle, start === undefined ? "" : formatHHMM(start)].filter(Boolean).join(" · ");
});

function sendUpNext(): void {
  const item = upNextItem.value;
  if (!item) return;
  if (item.id === preparedItemId.value) prepare(null);
  activate(item.id);
}

/** Destravar manda ao ar o que ficou na fila. */
function toggleLock(): void {
  const locking = !outputLocked.value;
  setOutputLocked(locking);
  if (locking) return;
  const queued = preparedItemId.value;
  prepare(null);
  if (queued) activate(queued, { force: true });
}

/* ─── Itens ─── */

const itemDialogOpen = ref(false);
const editingItem = ref<ProgramItem | null>(null);
const editingSessionId = ref<string | null>(null);

/** Garante uma sessão para receber o item: programa vazio ganha a sessão padrão. */
function ensureSession(): string {
  const selected = selectedItemId.value ? sessionOf(selectedItemId.value) : null;
  if (selected) return selected.id;
  const last = program.value.sessions.at(-1);
  return last ? last.id : addSession(tm("program.default_session")).id;
}

function openNewItem(): void {
  editingItem.value = null;
  editingSessionId.value = ensureSession();
  itemDialogOpen.value = true;
}

function openEditItem(itemId: string): void {
  const item = findItem(itemId);
  if (!item) return;
  editingItem.value = item;
  editingSessionId.value = sessionOf(itemId)?.id ?? null;
  itemDialogOpen.value = true;
}

function onSaveItem({ item, sessionId }: { item: ProgramItem; sessionId: string }): void {
  if (editingItem.value) updateItem(item.id, item, sessionId);
  else addItem(item, sessionId);
}

function confirmRemoveItem(itemId: string | null): void {
  const item = itemId ? findItem(itemId) : null;
  if (!item) return;
  $alert.yesno({ title: alertKey("alerts.remove_item_title"), text: alertKey("alerts.remove_item") }, (resp?: string) => {
    if (resp !== "yes") return;
    removeItem(item.id);
    itemDialogOpen.value = false;
  });
}

function duplicateSelected(): void {
  if (selectedItemId.value) duplicateItem(selectedItemId.value);
}

/* ─── Sessões ─── */

const sessionDialogOpen = ref(false);
const editingSession = ref<ProgramSession | null>(null);

function openNewSession(): void {
  editingSession.value = null;
  sessionDialogOpen.value = true;
}

function openEditSession(sessionId: string): void {
  editingSession.value = program.value.sessions.find((s) => s.id === sessionId) ?? null;
  sessionDialogOpen.value = !!editingSession.value;
}

function onSaveSession(label: string): void {
  if (editingSession.value) updateSession(editingSession.value.id, { label });
  else addSession(label);
}

function confirmRemoveSession(): void {
  const session = editingSession.value;
  if (!session) return;
  const text = session.items.length ? "alerts.remove_session_items" : "alerts.remove_session";
  $alert.yesno({ title: alertKey("alerts.remove_session_title"), text: alertKey(text) }, (resp?: string) => {
    if (resp !== "yes") return;
    removeSession(session.id);
    sessionDialogOpen.value = false;
  });
}

/* ─── Programa ─── */

const settingsDialogOpen = ref(false);

async function loadAnnouncements(): Promise<{ id: string; title: string }[]> {
  try {
    const all = await $idb.getAll<{ id: string | number; nome: string; ordem: number }>(DB_TABLE.ANNOUNCEMENTS);
    return all.sort((a, b) => a.ordem - b.ordem).map((a) => ({ id: String(a.id), title: a.nome }));
  } catch (e) {
    Telemetry.captureException(e, { source: "presentation_mode.load_announcements" });
    return [];
  }
}

/** Liturgia do dia da semana da data do programa, copiada para o programa. */
function importFromLiturgy(): void {
  const [y, m, d] = date.value.split("-").map(Number);
  const liturgy = $liturgy.list(new Date(y, m - 1, d).getDay());
  if (!liturgy.length) {
    $alert.info({ text: alertKey("alerts.liturgy_empty") });
    return;
  }

  const apply = async (): Promise<void> => {
    const imported = importLiturgy(liturgy, {
      newId,
      defaultSessionLabel: tm("program.default_session"),
      announcements: await loadAnnouncements(),
    });
    setSessions(imported.sessions);
    if (imported.plannedStart) setPlannedStart(imported.plannedStart);
    Telemetry.track("presentation_liturgy_imported", { items: liturgy.length });
  };

  if (!program.value.sessions.length) {
    void apply();
    return;
  }
  $alert.yesno({ title: alertKey("alerts.import_title"), text: alertKey("alerts.import_replace") }, (resp?: string) => {
    if (resp === "yes") void apply();
  });
}

/** O programa do dia grava sozinho; "Salvar" guarda uma cópia como liturgia reutilizável. */
function saveAsLiturgy(): void {
  if (!program.value.sessions.length) {
    $alert.info({ text: alertKey("alerts.program_empty") });
    return;
  }
  const [y, m, d] = date.value.split("-");
  $alert.prompt(
    { title: alertKey("alerts.save_title"), input_default: tm("program.save_default_name", { date: `${d}/${m}/${y}` }) },
    (name: string | null) => {
      if (!name?.trim()) return;
      void useLiturgyLibrary()
        .save({ name: name.trim(), items: programToLiturgy(program.value, newId), binding: null })
        .then(() => $alert.info({ text: alertKey("alerts.saved") }))
        .catch((e: unknown) => {
          Telemetry.captureException(e, { source: "presentation_mode.save_as_liturgy" });
          $alert.error({ text: alertKey("alerts.save_failed") });
        });
    }
  );
}

// Todas as ações do ribbon contextual chegam aqui. As que ainda não têm
// handler são ignoradas até a fase que as implementa.
const RIBBON_HANDLERS: Record<string, () => void> = {
  toggle_expand: toggleExpand,
  new_session: openNewSession,
  new_item: openNewItem,
  duplicate: duplicateSelected,
  delete_item: () => confirmRemoveItem(selectedItemId.value),
  import_liturgy: importFromLiturgy,
  save_program: saveAsLiturgy,
  start: () => void startOutputs(),
  stop: () => void stopOutputs(),
  clear: () => setCleared(!cleared.value),
  previous: () => navigate("prev"),
  next: () => navigate("next"),
  lock_output: toggleLock,
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
