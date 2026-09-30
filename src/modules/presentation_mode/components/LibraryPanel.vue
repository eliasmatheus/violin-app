<template>
  <section ref="root" class="pm-library" data-testid="pm-library">
    <div
      class="pm-library__resize"
      role="separator"
      aria-orientation="horizontal"
      :aria-label="tm('library.resize')"
      :title="tm('library.resize')"
      data-testid="pm-library-resize"
      @pointerdown="startResize"
      @dblclick="emit('toggle-height')"
    />
    <header class="pm-library__tabs">
      <div class="pm-library__tablist" role="tablist">
        <button type="button" role="tab" aria-selected="true" class="pm-library__tab pm-library__tab--active">
          <LjIcon :icon="ICONS.UI.FOLDER_OPEN" :size="15" />{{ tm("library.files") }}
        </button>
      </div>
      <div class="pm-library__tools">
        <LjButton
          size="sm"
          icon-only
          :icon="fullWidth ? ICONS.ACTIONS.COLLAPSE_WIDTH : ICONS.ACTIONS.EXPAND_WIDTH"
          :title="fullWidth ? tm('library.normal_width') : tm('library.full_width')"
          :aria-pressed="fullWidth"
          data-testid="pm-library-width"
          @click="emit('toggle-width')"
        />
        <LjButton
          size="sm"
          icon-only
          :icon="tall ? ICONS.UI.CHEVRON_DOWN : ICONS.UI.CHEVRON_UP"
          :title="tall ? tm('library.shorter') : tm('library.taller')"
          :aria-pressed="tall"
          data-testid="pm-library-height"
          @click="emit('toggle-height')"
        />
      </div>
    </header>

    <div v-if="!lib.supported" class="pm-library__unsupported">
      <LjEmpty :icon="ICONS.UI.FOLDER_OPEN" :title="tm('library.desktop_only')" />
    </div>

    <div v-else class="pm-library__body" :class="{ 'pm-library__body--details': !!selected }">
      <nav class="pm-folders" :aria-label="tm('library.folders')">
        <button
          type="button"
          class="pm-folder"
          :class="{ 'pm-folder--active': lib.source.value === ALL }"
          @click="lib.openSource(ALL)"
        >
          <LjIcon :icon="ICONS.UI.FOLDER_MULTIPLE" :size="15" />
          <span class="pm-folder__label">{{ tm("library.all") }}</span>
          <span class="pm-folder__count">{{ lib.counts.value[ALL] ?? "" }}</span>
        </button>
        <button
          type="button"
          class="pm-folder"
          :class="{ 'pm-folder--active': lib.source.value === FAVORITES }"
          @click="lib.openSource(FAVORITES)"
        >
          <LjIcon :icon="ICONS.UI.FOLDER_HEART" :size="15" />
          <span class="pm-folder__label">{{ tm("library.favorites") }}</span>
          <span class="pm-folder__count">{{ lib.counts.value[FAVORITES] ?? "" }}</span>
        </button>
        <!-- Todos e Favoritos ficam fixos no topo; as pastas do operador se arrastam. -->
        <draggable
          :model-value="lib.folders.value"
          item-key="path"
          tag="div"
          class="pm-folders__user"
          :animation="150"
          ghost-class="pm-folder--ghost"
          @update:model-value="lib.reorderFolders"
        >
          <template #item="{ element: folder }">
            <div
              class="pm-folder pm-folder--user"
              :class="{ 'pm-folder--active': lib.source.value === folder.path }"
              role="button"
              tabindex="0"
              :title="folder.path"
              @click="lib.openSource(folder.path)"
              @keydown.enter="lib.openSource(folder.path)"
            >
              <LjIcon :icon="ICONS.UI.FOLDER" :size="15" />
              <span class="pm-folder__label">{{ folder.label }}</span>
              <span class="pm-folder__count">{{ lib.counts.value[folder.path] ?? "" }}</span>
              <button
                type="button"
                class="pm-folder__remove"
                :title="tm('library.remove_folder')"
                :aria-label="tm('library.remove_folder')"
                @click.stop="confirmRemove(folder.path)"
              >
                <LjIcon :icon="ICONS.ACTIONS.CLOSE" :size="11" />
              </button>
            </div>
          </template>
        </draggable>
        <button type="button" class="pm-folder pm-folder--add" data-testid="pm-library-add-folder" @click="lib.addFolder()">
          <LjIcon :icon="ICONS.UI.FOLDER_PLUS" :size="15" />
          <span class="pm-folder__label">{{ tm("library.add_folder") }}</span>
        </button>
      </nav>

      <div class="pm-files">
        <div v-if="emptyMessage" class="pm-files__empty">
          <p>{{ emptyMessage }}</p>
          <LjButton v-if="!lib.folders.value.length" size="sm" :icon="ICONS.UI.FOLDER_PLUS" @click="lib.addFolder()">
            {{ tm("library.add_folder") }}
          </LjButton>
        </div>
        <div v-else class="pm-files__grid" data-testid="pm-library-grid">
          <button
            v-for="entry in lib.entries.value"
            :key="entry.path"
            type="button"
            class="pm-file"
            :class="{ 'pm-file--selected': entry.path === selected?.path }"
            :title="entry.name"
            :data-testid="`pm-file-${entry.name}`"
            @click="lib.select(entry)"
            @dblclick="onOpen(entry)"
            @keydown.enter="onOpen(entry)"
          >
            <span class="pm-file__thumb">
              <img v-if="thumbOf(entry)" :src="thumbOf(entry)" alt="" loading="lazy" />
              <LjIcon v-else :icon="iconOf(entry)" :size="22" class="pm-file__icon" />
              <span v-if="durationOf(entry)" class="pm-file__badge">{{ durationOf(entry) }}</span>
            </span>
            <span class="pm-file__name">{{ entry.name }}</span>
          </button>
        </div>
        <footer class="pm-files__foot">
          <LjButton
            v-if="lib.canGoUp.value"
            size="sm"
            variant="ghost"
            icon-only
            :icon="ICONS.UI.ARROW_LEFT"
            :title="tm('library.up')"
            @click="lib.goUp()"
          />
          <LjIcon v-else :icon="ICONS.UI.FOLDER" :size="12" />
          <!-- rtl corta o começo do caminho; o bdi mantém a ordem dos caracteres. -->
          <span class="pm-files__path" :title="locationLabel"><bdi dir="ltr">{{ locationLabel }}</bdi></span>
          <span class="pm-files__count">{{ countLabel }}</span>
          <span class="pm-files__hint">{{ tm("library.hint") }}</span>
        </footer>
      </div>

      <aside v-if="selected" class="pm-details" data-testid="pm-library-details">
        <div class="pm-details__head">
          <span class="pm-details__title">{{ selected.name }}</span>
          <button
            type="button"
            class="pm-details__star"
            :aria-pressed="lib.isFavorite(selected)"
            :title="lib.isFavorite(selected) ? tm('library.unfavorite') : tm('library.favorite')"
            @click="lib.toggleFavorite(selected)"
          >
            <LjIcon :icon="lib.isFavorite(selected) ? ICONS.UI.STAR : ICONS.UI.STAR_OUTLINE" :size="15" />
          </button>
        </div>
        <dl class="pm-details__table">
          <dt>{{ tm("library.extension") }}</dt>
          <dd>{{ selected.ext.toUpperCase() }}</dd>
          <dt>{{ tm("library.size") }}</dt>
          <dd>{{ formatSize(selected.size) }}</dd>
          <template v-if="selectedMeta?.width">
            <dt>{{ tm("library.resolution") }}</dt>
            <dd>{{ selectedMeta.width }}×{{ selectedMeta.height }}</dd>
          </template>
          <template v-if="selectedMeta?.duration">
            <dt>{{ tm("library.duration") }}</dt>
            <dd>{{ clock(selectedMeta.duration) }}</dd>
          </template>
          <dt>{{ tm("library.modified") }}</dt>
          <dd>{{ formatDate(selected.mtimeMs) }}</dd>
        </dl>
        <div class="pm-details__actions">
          <LjButton variant="primary" block :icon="ICONS.PROJECTION.START" data-testid="pm-library-send" @click="emit('project', selected)">
            {{ tm("library.send") }}
          </LjButton>
          <LjButton block :icon="ICONS.ACTIONS.ADD" data-testid="pm-library-add" @click="emit('add-to-program', selected, selectedMeta)">
            {{ tm("library.add_to_program") }}
          </LjButton>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import draggable from "vuedraggable";
import { LjButton, LjEmpty, LjIcon } from "@/components/ui";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import $alert from "@/helpers/Alert";
import { useModuleI18n } from "@/composables/useModuleI18n";
import { ALL, FAVORITES, fileKind, useFileLibrary, type LibraryEntry } from "../composables/useFileLibrary";
import { useMediaMeta, type MediaMeta } from "../composables/useMediaMeta";

const props = defineProps<{ fullWidth: boolean; tall: boolean; height: number }>();

const emit = defineEmits<{
  "toggle-width": [];
  "toggle-height": [];
  resize: [height: number];
  "resize-end": [height: number];
  project: [entry: LibraryEntry];
  "add-to-program": [entry: LibraryEntry, meta: MediaMeta | null];
}>();

const { t, tm, locale } = useModuleI18n(ModuleEnum.PRESENTATION_MODE);

/* ─── Altura por arraste da borda de cima ─── */

const MIN_HEIGHT = 120;
/** O palco acima nunca fica menor que isso. */
const MIN_STAGE = 150;
const root = ref<HTMLElement | null>(null);

function startResize(event: PointerEvent): void {
  const handle = event.currentTarget as HTMLElement;
  const area = root.value?.parentElement;
  if (!area) return;
  handle.setPointerCapture(event.pointerId);
  const startY = event.clientY;
  const startHeight = props.height;
  const max = Math.max(MIN_HEIGHT, area.clientHeight - MIN_STAGE);
  let current = startHeight;

  const move = (e: PointerEvent) => {
    current = Math.min(max, Math.max(MIN_HEIGHT, startHeight + (startY - e.clientY)));
    emit("resize", current);
  };
  const end = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    emit("resize-end", current);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}
const lib = useFileLibrary();
const { meta, request } = useMediaMeta();

const selected = computed(() => lib.selected.value);
const selectedMeta = computed(() => (selected.value ? (meta.get(selected.value.path) ?? null) : null));

onMounted(() => {
  if (lib.supported) void lib.load();
});

// Miniaturas e durações da pasta aberta; o selecionado passa na frente da fila.
watch(
  () => lib.entries.value,
  (entries) => entries.forEach((e) => request(e)),
  { immediate: true }
);
watch(selected, (entry) => {
  if (entry) request(entry, { priority: true });
});

const KIND_ICON: Record<string, string> = {
  image: ICONS.MEDIA.IMAGE,
  video: ICONS.MEDIA.VIDEO_FILE,
  audio: ICONS.MUSIC.AUDIO,
  pdf: ICONS.UI.FILE_PDF,
  slja: ICONS.PROJECTION.PRESENT,
};

function iconOf(entry: LibraryEntry): string {
  if (entry.isDir) return ICONS.UI.FOLDER;
  return KIND_ICON[fileKind(entry.ext) ?? ""] ?? ICONS.UI.FILE;
}

function thumbOf(entry: LibraryEntry): string | undefined {
  return entry.isDir ? undefined : meta.get(entry.path)?.thumb;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

function durationOf(entry: LibraryEntry): string {
  const d = meta.get(entry.path)?.duration;
  return d ? clock(d) : "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(locale.value, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function onOpen(entry: LibraryEntry): void {
  if (entry.isDir) void lib.enter(entry);
  else emit("project", entry);
}

function confirmRemove(path: string): void {
  $alert.yesno(
    { title: `modules.${ModuleEnum.PRESENTATION_MODE}.library.remove_folder`, text: `modules.${ModuleEnum.PRESENTATION_MODE}.library.remove_folder_text` },
    (resp?: string) => {
      if (resp === "yes") void lib.removeFolder(path);
    }
  );
}

const locationLabel = computed(() => {
  if (lib.source.value === ALL) return tm("library.all");
  if (lib.source.value === FAVORITES) return tm("library.favorites");
  return lib.location.value ?? "";
});

const countLabel = computed(() =>
  t(`modules.${ModuleEnum.PRESENTATION_MODE}.library.items_count`, lib.fileCount.value)
);

const emptyMessage = computed(() => {
  if (lib.loading.value && !lib.entries.value.length) return tm("library.loading");
  if (!lib.folders.value.length && lib.source.value !== FAVORITES) return tm("library.no_folders");
  if (lib.missing.value) return tm("library.missing");
  if (!lib.entries.value.length) {
    return lib.source.value === FAVORITES ? tm("library.no_favorites") : tm("library.empty");
  }
  return "";
});
</script>

<style scoped>
.pm-library {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--lj-surface-bg);
  border-top: 1px solid var(--lj-surface-border);
}

/* Faixa de pegar sobre a borda de cima; o traço acende ao passar o mouse. */
.pm-library__resize {
  position: absolute;
  top: -1px;
  left: 0;
  right: 0;
  z-index: 2;
  height: 6px;
  cursor: row-resize;
  touch-action: none;
  transition: background 120ms var(--lj-ease);
}

.pm-library__resize:hover,
.pm-library__resize:active {
  background: linear-gradient(var(--lj-orange), var(--lj-orange)) top / 100% 2px no-repeat;
}

.pm-library__tabs {
  display: flex;
  align-items: stretch;
  height: 30px;
  flex-shrink: 0;
  background: var(--lj-surface-bg-soft);
  border-bottom: 1px solid var(--lj-surface-border);
}

/* Só as abas rolam; os botões de tamanho ficam fixos à direita. */
.pm-library__tablist {
  flex: 1;
  min-width: 0;
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
}

.pm-library__tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  flex-shrink: 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--lj-text-muted);
  font-size: 12px;
  cursor: pointer;
}

.pm-library__tab--active {
  background: var(--lj-surface-bg);
  border-bottom-color: var(--lj-orange);
  color: var(--lj-text);
}

.pm-library__tools {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  flex-shrink: 0;
}

.pm-library__unsupported {
  padding: var(--lj-space-4);
}

.pm-library__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
}

.pm-library__body--details {
  grid-template-columns: 168px minmax(0, 1fr) 222px;
}

.pm-folders {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid var(--lj-surface-border);
}

.pm-folder {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 27px;
  flex-shrink: 0;
  padding: 0 8px 0 9px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--lj-text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 120ms var(--lj-ease);
}

.pm-folder:hover {
  background: var(--lj-hover-bg);
}

.pm-folder :deep(svg) {
  flex-shrink: 0;
  color: var(--lj-orange);
}

.pm-folder--active {
  background: var(--lj-live-active-bg);
  border-left-color: var(--lj-orange);
}

.pm-folder__label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-folder__count {
  flex-shrink: 0;
  font-family: var(--lj-font-mono);
  font-size: 10px;
  color: var(--lj-text-subtle);
}

.pm-folder__remove {
  display: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--lj-text-muted);
  cursor: pointer;
}

.pm-folder--user:hover .pm-folder__remove,
.pm-folder__remove:focus-visible {
  display: flex;
}

.pm-folder--user:hover .pm-folder__count {
  display: none;
}

.pm-folders__user {
  display: flex;
  flex-direction: column;
}

.pm-folder--user {
  cursor: grab;
}

.pm-folder--ghost {
  opacity: 0.5;
}

.pm-folder--add {
  color: var(--lj-orange);
}

.pm-files {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.pm-files__grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px;
  align-content: start;
}

.pm-files__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--lj-space-3);
  padding: var(--lj-space-4);
  color: var(--lj-text-subtle);
  text-align: center;
}

.pm-files__empty p {
  margin: 0;
}

.pm-file {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--lj-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pm-file__thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--lj-surface-border);
  border-radius: 3px;
  background: var(--lj-live-stage-bg);
  transition: box-shadow 120ms var(--lj-ease);
}

.pm-file__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pm-file__icon {
  color: var(--lj-white-alpha-50);
}

.pm-file:hover .pm-file__thumb {
  border-color: var(--lj-navy-active);
}

.pm-file--selected .pm-file__thumb {
  box-shadow: inset 0 0 0 2px var(--lj-orange);
  border-color: var(--lj-orange);
}

.pm-file:focus-visible {
  outline: none;
}

.pm-file:focus-visible .pm-file__thumb {
  box-shadow: var(--lj-ui-focus);
}

.pm-file__badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 0 4px;
  border-radius: 2px;
  background: var(--lj-black-alpha-75);
  color: var(--lj-white);
  font-family: var(--lj-font-mono);
  font-size: 9.5px;
}

.pm-file__name {
  font-size: 10.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-files__foot {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  flex-shrink: 0;
  border-top: 1px solid var(--lj-surface-border);
  font-size: 10.5px;
  color: var(--lj-text-subtle);
}

.pm-files__path {
  min-width: 0;
  font-family: var(--lj-font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
}

.pm-files__count {
  flex-shrink: 0;
}

.pm-files__hint {
  margin-left: auto;
  flex-shrink: 0;
  white-space: nowrap;
}

.pm-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  border-left: 1px solid var(--lj-surface-border);
}

.pm-details__head {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.pm-details__title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--lj-orange);
  overflow-wrap: anywhere;
}

.pm-details__star {
  display: flex;
  padding: 2px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--lj-orange);
  cursor: pointer;
}

.pm-details__star:hover {
  background: var(--lj-hover-bg);
}

.pm-details__table {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 8px;
  margin: 0;
  font-size: 11px;
}

.pm-details__table dt {
  color: var(--lj-text-subtle);
}

.pm-details__table dd {
  margin: 0;
  font-family: var(--lj-font-mono);
  text-align: right;
}

.pm-details__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}
</style>
