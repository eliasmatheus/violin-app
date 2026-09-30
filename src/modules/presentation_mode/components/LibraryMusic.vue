<template>
  <div class="pm-music" data-testid="pm-library-music">
    <nav class="pm-music__cats" :aria-label="tm('music.categories')">
      <button
        v-for="cat in categoryList"
        :key="cat.id"
        type="button"
        class="pm-music__cat"
        :class="{ 'pm-music__cat--active': cat.id === categoryId && !query }"
        @click="openCategory(cat.id)"
      >
        <LjIcon :icon="cat.id === HYMNALS ? ICONS.MODULES.HYMNAL : ICONS.MODULES.ALBUM" :size="15" />
        <span class="pm-music__cat-label">{{ cat.name }}</span>
        <span class="pm-music__cat-count">{{ cat.albums.length }}</span>
      </button>
    </nav>

    <div class="pm-music__main">
      <header class="pm-music__head">
        <LjButton
          v-if="album && !query"
          size="sm"
          variant="ghost"
          icon-only
          :icon="ICONS.UI.ARROW_LEFT"
          :title="tm('music.back')"
          @click="album = null"
        />
        <span v-if="album && !query" class="pm-music__album-title">{{ album.name }}</span>
        <div class="pm-music__search">
          <LjInput
            v-model="query"
            size="sm"
            :icon="ICONS.ACTIONS.SEARCH"
            :placeholder="tm('music.search')"
            clearable
            data-testid="pm-music-search"
          />
        </div>
      </header>

      <p v-if="loading" class="pm-music__note">{{ tm("library.loading") }}</p>

      <!-- Busca: nome, coletânea ou número do hino. -->
      <ol v-else-if="query" class="pm-songs" data-testid="pm-music-results">
        <li v-if="!results.length" class="pm-music__note">{{ tm("music.no_results") }}</li>
        <SongRow
          v-for="song in results"
          :key="song.id_music"
          :song="song"
          @preview="emit('preview-song', song)"
          @play="(mode: MusicMode) => emit('play-song', song, mode)"
          @add="(mode: MusicMode) => emit('add-song', song, mode)"
        />
      </ol>

      <ol v-else-if="album" class="pm-songs" data-testid="pm-music-album">
        <SongRow
          v-for="song in albumSongs"
          :key="song.id_music"
          :song="song"
          @preview="emit('preview-song', song)"
          @play="(mode: MusicMode) => emit('play-song', song, mode)"
          @add="(mode: MusicMode) => emit('add-song', song, mode)"
        />
      </ol>

      <div v-else class="pm-albums" data-testid="pm-music-albums">
        <button
          v-for="a in currentAlbums"
          :key="a.id_album"
          type="button"
          class="pm-album"
          :title="a.name"
          :data-testid="`pm-album-${a.id_album}`"
          @click="openAlbum(a)"
        >
          <span class="pm-album__cover" :style="a.color ? { background: a.color } : undefined">
            <img v-if="a.url_image" :src="Path.file(a.url_image)" alt="" loading="lazy" />
            <LjIcon v-else :icon="ICONS.MODULES.ALBUM" :size="26" />
          </span>
          <span class="pm-album__name">{{ a.name }}</span>
          <span v-if="a.subtitle" class="pm-album__sub">{{ a.subtitle }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { LjButton, LjIcon, LjInput } from "@/components/ui";
import { ICONS } from "@/config/Icons";
import { ModuleEnum } from "@/enums/ModuleEnum";
import Database from "@/helpers/Database";
import Path from "@/helpers/Path";
import Strings from "@/helpers/Strings";
import Telemetry from "@/helpers/Telemetry";
import { useModuleI18n } from "@/composables/useModuleI18n";
import { useDisabledAlbums } from "@/composables/useMusicCatalog";
import { isAlbumEnabled } from "@root/config/musicCatalog.mjs";
import SongRow, { type LibrarySong } from "./LibrarySongRow.vue";
import type { MusicMode } from "../program/musicModes";

/**
 * Aba Músicas da biblioteca: as coletâneas do LouvorJA por capa, e a busca
 * por nome, coletânea ou número de hino. Um clique leva a música para a
 * prévia do palco; ▶ ou duplo clique toca; + põe no programa.
 */

interface CatalogAlbum {
  id_album: number;
  name: string;
  url_image?: string;
  color?: string;
  subtitle?: string;
  order?: number;
}

interface CatalogMusic {
  id_music: number;
  name: string;
  duration?: string;
  has_instrumental_music?: number | boolean;
  albums_names?: string;
  albums?: { id_album: number; name: string; type?: string; pivot?: { track?: number } }[];
}

interface Category {
  id: string | number;
  name: string;
  albums: CatalogAlbum[];
}

const emit = defineEmits<{
  "preview-song": [song: LibrarySong];
  "play-song": [song: LibrarySong, mode: MusicMode];
  "add-song": [song: LibrarySong, mode: MusicMode];
}>();

const { tm, locale } = useModuleI18n(ModuleEnum.PRESENTATION_MODE);
const disabledAlbums = useDisabledAlbums();

const HYMNALS = "__hymnals__";
const MAX_RESULTS = 100;

const categories = ref<Category[]>([]);
const catalog = ref<CatalogMusic[]>([]);
const loading = ref(false);
const categoryId = ref<string | number | null>(null);
const album = ref<CatalogAlbum | null>(null);
const albumSongs = ref<LibrarySong[]>([]);
const query = ref("");

const enabled = (id: number) => isAlbumEnabled(id, disabledAlbums.value);

/** Hinários não estão nas categorias da coletânea: vêm dos álbuns do catálogo. */
const hymnalCategory = computed<Category | null>(() => {
  const seen = new Map<number, CatalogAlbum>();
  for (const music of catalog.value) {
    for (const a of music.albums ?? []) {
      if (a.type === "hymnal" && enabled(a.id_album) && !seen.has(a.id_album)) {
        seen.set(a.id_album, { id_album: a.id_album, name: a.name });
      }
    }
  }
  return seen.size ? { id: HYMNALS, name: tm("music.hymnals"), albums: [...seen.values()] } : null;
});

const categoryList = computed<Category[]>(() => {
  const list = categories.value.map((c) => ({ ...c, albums: c.albums.filter((a) => enabled(a.id_album)) }));
  return hymnalCategory.value ? [hymnalCategory.value, ...list] : list;
});

const currentAlbums = computed(
  () => categoryList.value.find((c) => c.id === categoryId.value)?.albums ?? []
);

function toSong(music: CatalogMusic, albumName?: string, track?: number): LibrarySong {
  return {
    id_music: music.id_music,
    name: music.name,
    duration: music.duration,
    album: albumName ?? music.albums_names ?? "",
    track,
    has_instrumental_music: !!music.has_instrumental_music,
  };
}

/** Número puro procura a faixa nos hinários; texto procura nome e coletânea. */
const results = computed<LibrarySong[]>(() => {
  const q = query.value.trim();
  if (!q) return [];
  const out: LibrarySong[] = [];
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    for (const music of catalog.value) {
      for (const a of music.albums ?? []) {
        if (a.type === "hymnal" && a.pivot?.track === n && enabled(a.id_album)) {
          out.push(toSong(music, a.name, n));
        }
      }
    }
    return out;
  }
  const folded = Strings.fold(q);
  for (const music of catalog.value) {
    if (!(music.albums ?? []).some((a) => enabled(a.id_album))) continue;
    if (Strings.fold(music.name).includes(folded) || Strings.fold(music.albums_names ?? "").includes(folded)) {
      out.push(toSong(music));
      if (out.length >= MAX_RESULTS) break;
    }
  }
  return out;
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [cats, musics] = await Promise.all([
      Database.get<Category[] & { id_category?: number }[]>(`${locale.value}_categories`),
      Database.get<CatalogMusic[]>(`${locale.value}_musics`),
    ]);
    categories.value = ((cats as unknown as { id_category: number; name: string; order: number; albums: CatalogAlbum[] }[]) ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        id: c.id_category,
        name: c.name,
        albums: [...(c.albums ?? [])].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)),
      }));
    catalog.value = musics ?? [];
    categoryId.value = categoryList.value[0]?.id ?? null;
  } catch (e) {
    Telemetry.captureException(e, { source: "presentation_mode.library.music" });
  } finally {
    loading.value = false;
  }
}

function openCategory(id: string | number): void {
  query.value = "";
  categoryId.value = id;
  album.value = null;
}

async function openAlbum(a: CatalogAlbum): Promise<void> {
  album.value = a;
  albumSongs.value = [];
  try {
    const data = await Database.get<{ musics?: (CatalogMusic & { track?: number })[] }>(`album_${a.id_album}`);
    if (album.value !== a) return;
    albumSongs.value = (data?.musics ?? [])
      .slice()
      .sort((x, y) => (x.track ?? 0) - (y.track ?? 0))
      .map((m) => toSong(m, a.name, m.track));
  } catch (e) {
    Telemetry.captureException(e, { source: "presentation_mode.library.album" });
  }
}

onMounted(() => void load());
watch(locale, () => void load());
</script>

<style scoped>
.pm-music {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
}

.pm-music__cats {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid var(--lj-surface-border);
}

.pm-music__cat {
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

.pm-music__cat:hover {
  background: var(--lj-hover-bg);
}

.pm-music__cat :deep(svg) {
  flex-shrink: 0;
  color: var(--lj-orange);
}

.pm-music__cat--active {
  background: var(--lj-live-active-bg);
  border-left-color: var(--lj-orange);
}

.pm-music__cat-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-music__cat-count {
  flex-shrink: 0;
  font-family: var(--lj-font-mono);
  font-size: 10px;
  color: var(--lj-text-subtle);
}

.pm-music__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.pm-music__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--lj-surface-border);
}

.pm-music__album-title {
  min-width: 0;
  font-weight: var(--lj-weight-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-music__search {
  width: 260px;
  max-width: 100%;
  margin-left: auto;
}

.pm-music__note {
  margin: auto;
  padding: var(--lj-space-4);
  color: var(--lj-text-subtle);
  list-style: none;
}

.pm-songs {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.pm-albums {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 10px;
  align-content: start;
}

.pm-album {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--lj-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pm-album__cover {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--lj-surface-border);
  border-radius: 3px;
  background: var(--lj-live-stage-bg);
  color: var(--lj-white-alpha-50);
  transition: border-color 120ms var(--lj-ease);
}

.pm-album:hover .pm-album__cover,
.pm-album:focus-visible .pm-album__cover {
  border-color: var(--lj-navy-active);
}

.pm-album:focus-visible {
  outline: none;
}

.pm-album__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pm-album__name {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-album__sub {
  font-size: 10px;
  color: var(--lj-text-subtle);
}
</style>
