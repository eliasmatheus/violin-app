import { computed, onScopeDispose, shallowRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useI18n } from "vue-i18n";
import Database from "@/helpers/Database";
import UserData from "@/helpers/UserData";
import { KEYS, moduleShowInMainMenu } from "@/constants/UserDataKeys";
import { albumYears, HYMNAL_ALBUM_IDS, prepareMusicCatalog } from "@root/config/musicCatalog.mjs";
import type { LiturgyMusicItem } from "@/types/Liturgy";

export function getDisabledAlbums() {
  const saved = UserData.get<(number | string)[]>(KEYS.OPTIONS.DISABLED_ALBUMS, []);
  const disabled = Array.isArray(saved) ? [...saved] : [];
  if (!UserData.get(moduleShowInMainMenu("hymnal_1996"), false)) {
    disabled.push(HYMNAL_ALBUM_IDS.legacy);
  }
  return disabled;
}

export function useDisabledAlbums() {
  return computed(getDisabledAlbums);
}

export function useMusicCatalog<
  T extends Pick<LiturgyMusicItem, "name" | "albums" | "albums_names" | "custom_song_id">,
>(source: MaybeRefOrGetter<T[]>, enabled: MaybeRefOrGetter<boolean> = true) {
  const { locale } = useI18n();
  const disabledAlbums = useDisabledAlbums();
  const years = shallowRef<Map<string, number>>(new Map());
  let revision = 0;
  onScopeDispose(() => {
    revision++;
  });

  watch(
    [locale, () => toValue(enabled)],
    async ([language, active]) => {
      const current = ++revision;
      years.value = new Map();
      if (!active) return;
      try {
        const categories = await Database.get(`${language}_categories`, { silent: true });
        if (current === revision) years.value = albumYears(categories);
      } catch {
        // O catálogo continua disponível com anos explícitos e edições conhecidas.
      }
    },
    { immediate: true }
  );

  const musics = computed(() =>
    prepareMusicCatalog(toValue(source), disabledAlbums.value, years.value)
  );
  return { musics, disabledAlbums, years };
}
