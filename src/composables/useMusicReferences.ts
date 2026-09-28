import { computed, shallowRef, toValue, watch, onScopeDispose, type MaybeRefOrGetter } from "vue";
import { useI18n } from "vue-i18n";
import Database from "@/helpers/Database";
import { useMusicCatalog } from "./useMusicCatalog";
import type { MusicItem } from "@/types/Music";

/** Aplica o catálogo a listas salvas sem alterar seus dados ou a ordem do usuário. */
export function useMusicReferences<T extends { id_music: number; name: string }>(
  source: MaybeRefOrGetter<T[]>
) {
  const { locale } = useI18n();
  const catalog = shallowRef<MusicItem[]>([]);
  const { musics } = useMusicCatalog(catalog);
  const knownIds = computed(() => new Set(catalog.value.map((music) => Number(music.id_music))));
  const visibleById = computed(
    () => new Map(musics.value.map((music) => [Number(music.id_music), music]))
  );
  let revision = 0;
  onScopeDispose(() => {
    revision++;
  });
  watch(
    locale,
    async (language) => {
      const current = ++revision;
      catalog.value = [];
      try {
        const data = await Database.get<MusicItem[]>(`${language}_musics`, { silent: true });
        if (current === revision && Array.isArray(data)) catalog.value = data;
      } catch {
        // As referências salvas continuam disponíveis quando o catálogo não está acessível.
      }
    },
    { immediate: true }
  );

  function isAvailable(song: { id_music: number }) {
    const id = Number(song.id_music);
    return !knownIds.value.has(id) || visibleById.value.has(id);
  }

  const items = computed(() =>
    toValue(source)
      .filter(isAvailable)
      .map((song) => {
        const music = visibleById.value.get(Number(song.id_music));
        return music ? { ...song, albums: music.albums, albums_names: music.albums_names } : song;
      })
  );

  /** Reordena os lugares visíveis, mantendo as referências ocultas salvas. */
  function reorder(visible: T[]): T[] {
    const saved = toValue(source);
    const byId = new Map(saved.map((song) => [Number(song.id_music), song]));
    let index = 0;
    return saved.map((song) =>
      isAvailable(song) ? byId.get(Number(visible[index++]?.id_music)) || song : song
    );
  }

  return { items, isAvailable, reorder };
}
