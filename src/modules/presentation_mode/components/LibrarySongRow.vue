<template>
  <LjContextMenu :items="menu">
    <li
      class="pm-song"
      role="button"
      tabindex="0"
      :data-testid="`pm-song-${song.id_music}`"
      @click="emit('preview')"
      @dblclick="emit('play', 'sung')"
      @keydown.enter.self="emit('play', 'sung')"
    >
      <span class="pm-song__track">{{ song.track ?? "" }}</span>
      <LjIcon :icon="ICONS.MUSIC.MUSIC" :size="14" class="pm-song__icon" />
      <span class="pm-song__text">
        <span class="pm-song__name">{{ song.name }}</span>
        <span v-if="song.album" class="pm-song__album">{{ song.album }}</span>
      </span>
      <span class="pm-song__duration">{{ shortDuration }}</span>
      <span class="pm-song__actions">
        <LjTooltip :text="tm('library.play')">
          <button
            type="button"
            class="pm-song__btn"
            :aria-label="tm('library.play')"
            :data-testid="`pm-song-play-${song.id_music}`"
            @click.stop="emit('play', 'sung')"
            @dblclick.stop
          >
            <LjIcon :icon="ICONS.PLAYER.PLAY" :size="13" />
          </button>
        </LjTooltip>
        <LjTooltip :text="tm('library.add_to_program')">
          <button
            type="button"
            class="pm-song__btn"
            :aria-label="tm('library.add_to_program')"
            :data-testid="`pm-song-add-${song.id_music}`"
            @click.stop="emit('add', 'sung')"
            @dblclick.stop
          >
            <LjIcon :icon="ICONS.ACTIONS.ADD" :size="13" />
          </button>
        </LjTooltip>
        <LjMenu :items="menu" align="end">
          <template #trigger>
            <button
              type="button"
              class="pm-song__btn"
              :aria-label="tm('music_modes.more')"
              :title="tm('music_modes.more')"
              :data-testid="`pm-song-more-${song.id_music}`"
              @click.stop
              @dblclick.stop
            >
              <LjIcon :icon="ICONS.UI.DOTS_VERTICAL" :size="13" />
            </button>
          </template>
        </LjMenu>
      </span>
    </li>
  </LjContextMenu>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { LjContextMenu, LjIcon, LjMenu, LjTooltip, type LjMenuItem } from "@/components/ui";
import { modesFor, type MusicMode } from "../program/musicModes";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import { useModuleI18n } from "@/composables/useModuleI18n";

export interface LibrarySong {
  id_music: number;
  name: string;
  /** "00:03:39" do catálogo. */
  duration?: string;
  album: string;
  track?: number;
  has_instrumental_music: boolean;
}

const props = defineProps<{ song: LibrarySong }>();
const emit = defineEmits<{ preview: []; play: [mode: MusicMode]; add: [mode: MusicMode] }>();

const { tm } = useModuleI18n(ModuleEnum.PRESENTATION_MODE);

/**
 * Tocar e adicionar em qualquer formato: com banda, "Só letra"; sem banda,
 * "Cantado" ou "Playback". O ▶ e o + da linha usam "Cantado".
 */
const menu = computed<LjMenuItem[]>(() => {
  const modes = modesFor(props.song.has_instrumental_music);
  return [
    { label: tm("music_modes.play_as") },
    ...modes.map((m) => ({ label: tm(m.label), icon: m.icon, action: () => emit("play", m.value) })),
    { separator: true },
    { label: tm("music_modes.add_as") },
    ...modes.map((m) => ({ label: tm(m.label), icon: m.icon, action: () => emit("add", m.value) })),
  ];
});

/** "00:03:39" → "3:39". */
const shortDuration = computed(() => {
  const parts = (props.song.duration ?? "").split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
  const [h, m, s] = parts;
  const total = h * 60 + m;
  return `${total}:${String(s).padStart(2, "0")}`;
});
</script>

<style scoped>
.pm-song {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--lj-surface-divider);
  cursor: pointer;
  transition: background 120ms var(--lj-ease);
}

.pm-song:hover {
  background: var(--lj-hover-bg);
}

.pm-song:focus-visible {
  outline: none;
  box-shadow: inset var(--lj-ui-focus);
}

.pm-song__track {
  width: 26px;
  flex-shrink: 0;
  font-family: var(--lj-font-mono);
  font-size: 10.5px;
  color: var(--lj-text-subtle);
  text-align: right;
}

.pm-song__icon {
  flex-shrink: 0;
  color: var(--lj-text-muted);
}

.pm-song__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.pm-song__name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-song__album {
  font-size: 10.5px;
  color: var(--lj-text-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-song__duration {
  flex-shrink: 0;
  font-family: var(--lj-font-mono);
  font-size: 10.5px;
  color: var(--lj-text-subtle);
}

.pm-song__actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 120ms var(--lj-ease);
}

.pm-song:hover .pm-song__actions,
.pm-song:focus-within .pm-song__actions {
  opacity: 1;
}

.pm-song__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--lj-surface-border);
  border-radius: 3px;
  background: var(--lj-surface-bg);
  color: var(--lj-text);
  cursor: pointer;
}

.pm-song__btn:hover {
  border-color: var(--lj-navy-active);
}

.pm-song__btn:focus-visible {
  outline: none;
  box-shadow: var(--lj-ui-focus);
}
</style>
