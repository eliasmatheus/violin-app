<template>
  <div
    v-if="conflicts.length"
    class="pm-series pm-series--conflict"
    data-testid="pm-series-conflict"
  >
    <LjIcon :icon="ICONS.UI.ALERT" :size="15" class="pm-series__icon" />
    <span class="pm-series__next">
      {{ tm("series.conflict_bar", { count: conflicts.length }) }}
    </span>
    <LjButton
      size="sm"
      variant="primary"
      data-testid="pm-series-conflict-open"
      @click="conflictOpen = true"
    >
      {{ tm("series.conflict_review") }}
    </LjButton>
  </div>
  <div
    v-else-if="doc"
    class="pm-series"
    :class="{ 'pm-series--done': done }"
    data-testid="pm-series-bar"
  >
    <LjIcon :icon="ICONS.MEDIA.PLAYLIST" :size="15" class="pm-series__icon" />
    <span class="pm-series__name">{{ doc.name }}</span>
    <span class="pm-series__count" data-testid="pm-series-count">
      {{ tm("series.count", { played: progress.played, total: progress.total }) }}
    </span>
    <template v-if="done">
      <span class="pm-series__done" data-testid="pm-series-done">{{ tm("series.done") }}</span>
      <LjButton
        size="sm"
        :icon="ICONS.ACTIONS.RESTART"
        data-testid="pm-series-restart"
        @click="series.restart(dir)"
      >
        {{ tm("series.restart") }}
      </LjButton>
    </template>
    <template v-else-if="progress.next">
      <span class="pm-series__next" :title="progress.next">
        {{ tm("series.next") }}
        <strong data-testid="pm-series-next">{{ progress.next }}</strong>
      </span>
      <LjButton
        size="sm"
        variant="ghost"
        :icon="ICONS.UI.EYE"
        @click="emit('preview', progress.next)"
      >
        {{ tm("series.show") }}
      </LjButton>
      <LjButton
        size="sm"
        variant="primary"
        :icon="ICONS.PLAYER.PLAY"
        data-testid="pm-series-send"
        @click="emit('play', progress.next)"
      >
        {{ tm("series.send") }}
      </LjButton>
    </template>
    <LjMenu :items="menu" align="end">
      <template #trigger>
        <LjButton
          size="sm"
          variant="ghost"
          icon-only
          :icon="ICONS.UI.DOTS_VERTICAL"
          :title="tm('series.options')"
        />
      </template>
    </LjMenu>
  </div>

  <SeriesConflictDialog
    v-if="conflicts.length"
    v-model="conflictOpen"
    :dir="dir"
    :versions="conflicts"
  />

  <LjDialog
    v-model="dialogOpen"
    :title="tm('series.dialog_title')"
    :icon="ICONS.MEDIA.PLAYLIST"
    size="sm"
  >
    <form class="pm-series-form" data-testid="pm-series-dialog" @submit.prevent="save">
      <p class="pm-series-form__help">{{ tm("series.dialog_help") }}</p>
      <LjField :label="tm('series.name')">
        <LjInput v-model="name" autofocus data-testid="pm-series-name" />
      </LjField>
      <LjField :label="tm('series.on_end')">
        <LjSelect v-model="onEnd" :items="onEndItems" data-testid="pm-series-on-end" />
      </LjField>
    </form>
    <template #footer>
      <LjButton @click="dialogOpen = false">{{ t("actions.cancel") }}</LjButton>
      <LjButton
        variant="primary"
        :disabled="!name.trim()"
        data-testid="pm-series-save"
        @click="save"
      >
        {{ t("actions.save") }}
      </LjButton>
    </template>
  </LjDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  LjButton,
  LjDialog,
  LjField,
  LjIcon,
  LjInput,
  LjMenu,
  LjSelect,
  type LjMenuItem,
} from "@/components/ui";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import $alert from "@/helpers/Alert";
import { useModuleI18n } from "@/composables/useModuleI18n";
import type { SeriesDoc } from "@/types/Series";
import { useSeries } from "../composables/useSeries";
import SeriesConflictDialog from "./SeriesConflictDialog.vue";
import { progressOf } from "../program/series";

/**
 * A pasta aberta como série: quantos já passaram, qual é o próximo e o botão
 * de mandá-lo ao ar. O histórico fica na própria pasta — numa pasta
 * compartilhada na nuvem, ele vale para todo computador que abrir a mesma pasta.
 */

const props = defineProps<{
  dir: string;
  /** Os vídeos da pasta, na ordem da grade. */
  files: string[];
}>();
const emit = defineEmits<{ preview: [file: string]; play: [file: string] }>();

const { t, tm } = useModuleI18n(ModuleEnum.PRESENTATION_MODE);
const alertKey = (key: string) => `modules.${ModuleEnum.PRESENTATION_MODE}.${key}`;
const series = useSeries();

watch(
  () => props.dir,
  (dir) => void series.load(dir),
  { immediate: true }
);

const doc = computed(() => series.of(props.dir));
const conflicts = computed(() => series.conflictsOf(props.dir));
const conflictOpen = ref(false);
const progress = computed(() =>
  doc.value
    ? progressOf(doc.value, props.files)
    : { next: null, played: 0, total: 0, completed: false }
);
const done = computed(() => progress.value.completed && doc.value?.onEnd === "suggest_new");

// Momento Saúde: passou o último, recomeça sozinho.
watch(
  () => progress.value.completed && doc.value?.onEnd === "restart",
  (restart) => {
    if (restart) void series.restart(props.dir);
  }
);

const menu = computed<LjMenuItem[]>(() => [
  { label: tm("series.edit"), icon: ICONS.ACTIONS.EDIT, action: openDialog },
  {
    label: tm("series.restart"),
    icon: ICONS.ACTIONS.RESTART,
    action: () =>
      $alert.yesno(
        { title: alertKey("series.restart"), text: alertKey("series.restart_confirm") },
        (resp?: string) => {
          if (resp === "yes") void series.restart(props.dir);
        }
      ),
  },
  { separator: true },
  {
    label: tm("series.disable"),
    icon: ICONS.ACTIONS.CLOSE,
    action: () => void series.disable(props.dir),
  },
]);

/* ─── Criar / editar ─── */

const dialogOpen = ref(false);
const name = ref("");
const onEnd = ref<SeriesDoc["onEnd"]>("restart");
const onEndItems = computed(() => [
  { value: "restart", label: tm("series.on_end_restart") },
  { value: "suggest_new", label: tm("series.on_end_new") },
]);

function openDialog(): void {
  name.value = doc.value?.name ?? props.dir.split(/[\\/]/).pop() ?? "";
  onEnd.value = doc.value?.onEnd ?? "restart";
  dialogOpen.value = true;
}

defineExpose({ openDialog });

async function save(): Promise<void> {
  if (!name.value.trim()) return;
  const current = doc.value;
  const ok = current
    ? await series.update(props.dir, (d) => ({ ...d, name: name.value.trim(), onEnd: onEnd.value }))
    : await series.create(props.dir, name.value.trim(), onEnd.value);
  if (ok) dialogOpen.value = false;
}
</script>

<style scoped>
.pm-series {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--lj-surface-border);
  background: var(--lj-live-active-bg);
  font-size: 12px;
}

.pm-series--conflict {
  background: color-mix(in srgb, var(--lj-warning) 18%, var(--lj-surface-bg));
}

.pm-series--conflict .pm-series__icon {
  color: var(--lj-warning);
}

.pm-series--done {
  background: var(--lj-surface-bg-soft);
}

.pm-series__icon {
  flex-shrink: 0;
  color: var(--lj-orange);
}

.pm-series__name {
  flex-shrink: 0;
  font-weight: var(--lj-weight-semibold);
}

.pm-series__count {
  flex-shrink: 0;
  font-family: var(--lj-font-mono);
  font-size: 11px;
  color: var(--lj-text-subtle);
}

.pm-series__next,
.pm-series__done {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-series__done {
  color: var(--lj-text-muted);
}

.pm-series-form {
  display: flex;
  flex-direction: column;
  gap: var(--lj-space-5);
}

.pm-series-form__help {
  margin: 0;
  font-size: 12px;
  color: var(--lj-text-muted);
}
</style>
