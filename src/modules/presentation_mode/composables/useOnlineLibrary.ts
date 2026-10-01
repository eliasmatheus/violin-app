import { computed, ref, shallowRef } from "vue";
import $docs from "@/helpers/DocStore";
import Telemetry from "@/helpers/Telemetry";
import { fetchWithTimeout, NET_TIMEOUT } from "@/helpers/Http";
import { DB_TABLE } from "@/constants/DbTables";
import {
  collectionsAvailable,
  listCollection,
  youtubeSourceFromUrl,
  type YouTubeCollectionEntry,
} from "@/helpers/OnlineVideo";
import { newId } from "./useProgram";

/**
 * Vídeos on-line da biblioteca: os favoritos do operador — vídeos soltos,
 * playlists e canais do YouTube — e o que está aberto na aba. O canal mostra
 * os vídeos do mais recente ao mais antigo; a playlist, na ordem dela. As
 * duas listas vêm aos pedaços, conforme o operador rola até o fim.
 *
 * Cada consulta ao YouTube passa pelo yt-dlp e leva segundos. Por isso a
 * primeira página fica guardada no favorito: abrir a lista é imediato, e ela
 * só é consultada de novo quando a cópia envelhece ou o operador pede.
 */

export type OnlineFavoriteKind = "video" | "playlist" | "channel";

export interface OnlineFavorite {
  id: string;
  kind: OnlineFavoriteKind;
  /** Vídeo: o ID de 11 caracteres. Playlist: o `list=`. Canal: "UC…" ou "@nome". */
  ytId: string;
  title: string;
  channel?: string;
  /** Avatar do canal. */
  thumbnail?: string | null;
  /** Playlist: o vídeo cuja capa a representa (o primeiro dela). */
  coverVideoId?: string;
  duration?: number | null;
  addedAt: string;
  order: number;
  /** Playlist e canal: a primeira página da última consulta. */
  snapshot?: { entries: OnlineEntry[]; hasMore: boolean; fetchedAt: string };
}

/** Um vídeo listado na aba — favorito solto ou de uma playlist/canal aberto. */
export interface OnlineEntry {
  id: string;
  title: string;
  duration: number | null;
  channel?: string;
}

/** O que está aberto: os vídeos soltos, ou uma playlist/canal favorito. */
export const VIDEOS = "__videos__";

const TABLE = DB_TABLE.PRESENTATION_ONLINE;
const PAGE = 50;
/** Depois disto a cópia guardada é mostrada, mas a lista é consultada de novo. */
const STALE_MS = 30 * 60 * 1000;

const favorites = ref<OnlineFavorite[]>([]);
let loaded: Promise<void> | null = null;

const openId = ref<string>(VIDEOS);
const entries = shallowRef<OnlineEntry[]>([]);
const hasMore = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
let generation = 0;

/** Lista de onde saiu o vídeo no ar: Anterior/Próximo andam por ela. */
const queue = shallowRef<{ entries: OnlineEntry[]; index: number } | null>(null);

function sorted(list: OnlineFavorite[]): OnlineFavorite[] {
  return [...list].sort((a, b) => a.order - b.order);
}

function ensureLoaded(): Promise<void> {
  loaded ??= $docs
    .getAll<OnlineFavorite>(TABLE)
    .then((docs) => {
      favorites.value = sorted(docs);
      if (openId.value === VIDEOS) entries.value = videoEntries();
    })
    .catch((e: unknown) => {
      loaded = null;
      Telemetry.captureException(e, { source: "presentation_mode.online.load" });
    });
  return loaded;
}

const videos = computed(() => favorites.value.filter((f) => f.kind === "video"));
const collections = computed(() => favorites.value.filter((f) => f.kind !== "video"));
const openFavorite = computed(() => favorites.value.find((f) => f.id === openId.value) ?? null);

function videoEntries(): OnlineEntry[] {
  return favorites.value
    .filter((f) => f.kind === "video")
    .map((f) => ({ id: f.ytId, title: f.title, duration: f.duration ?? null, channel: f.channel }));
}

async function oembed(videoId: string): Promise<{ title: string; channel: string } | null> {
  try {
    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
      { timeout: NET_TIMEOUT.QUICK, source: "youtube-oembed", thirdParty: true }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: unknown; author_name?: unknown };
    return {
      title: typeof json.title === "string" ? json.title : "",
      channel: typeof json.author_name === "string" ? json.author_name : "",
    };
  } catch {
    return null;
  }
}

export type AddResult = "added" | "exists" | "invalid" | "desktop_only" | "not_found";

/**
 * Favorita o que o link aponta. O título vem do YouTube na hora: oEmbed para
 * o vídeo, a primeira página da lista para playlist e canal.
 */
async function addFromUrl(url: string, lang: string): Promise<{ result: AddResult; favorite?: OnlineFavorite }> {
  await ensureLoaded();
  const source = youtubeSourceFromUrl(url.trim());
  if (!source) return { result: "invalid" };
  const existing = favorites.value.find((f) => f.kind === source.kind && f.ytId === source.id);
  if (existing) return { result: "exists", favorite: existing };

  const base = {
    id: newId(),
    kind: source.kind,
    ytId: source.id,
    addedAt: new Date().toISOString(),
    order: (favorites.value.at(-1)?.order ?? 0) + 1,
  };
  let favorite: OnlineFavorite;
  if (source.kind === "video") {
    const meta = await oembed(source.id);
    if (!meta) return { result: "not_found" };
    favorite = { ...base, title: meta.title || source.id, channel: meta.channel };
  } else {
    if (!collectionsAvailable()) return { result: "desktop_only" };
    try {
      // Uma consulta só: o título e a primeira página vêm juntos.
      const first = await listCollection(source, { start: 1, count: PAGE, lang });
      favorite = {
        ...base,
        title: first.title || source.id,
        channel: first.channel,
        thumbnail: first.thumbnail,
        coverVideoId: first.entries[0]?.id,
        snapshot: { entries: toEntries(first.entries, first.channel), hasMore: first.hasMore, fetchedAt: new Date().toISOString() },
      };
    } catch {
      return { result: "not_found" };
    }
  }
  favorites.value = [...favorites.value, favorite];
  await $docs.put(TABLE, favorite);
  if (openId.value === VIDEOS) entries.value = videoEntries();
  return { result: "added", favorite };
}

async function remove(id: string): Promise<void> {
  favorites.value = favorites.value.filter((f) => f.id !== id);
  await $docs.del(TABLE, id);
  if (openId.value === id) void open(VIDEOS);
  else if (openId.value === VIDEOS) entries.value = videoEntries();
}

/** Reordena um grupo (vídeos ou listas), mantendo o outro onde está. */
async function reorder(kind: "video" | "collection", list: OnlineFavorite[]): Promise<void> {
  const others = favorites.value.filter((f) => (kind === "video" ? f.kind !== "video" : f.kind === "video"));
  const next = [...(kind === "video" ? list : others), ...(kind === "video" ? others : list)].map((f, i) => ({
    ...f,
    order: i + 1,
  }));
  favorites.value = next;
  if (openId.value === VIDEOS) entries.value = videoEntries();
  await Promise.all(next.map((f) => $docs.put(TABLE, f)));
}

function toEntries(list: YouTubeCollectionEntry[], channel?: string): OnlineEntry[] {
  return list.map((e) => ({ id: e.id, title: e.title, duration: e.duration, channel }));
}

/** Guarda a primeira página no favorito, para a próxima abertura ser imediata. */
function keepSnapshot(fav: OnlineFavorite, list: OnlineEntry[], more: boolean): void {
  const updated: OnlineFavorite = {
    ...fav,
    snapshot: { entries: list.slice(0, PAGE), hasMore: more, fetchedAt: new Date().toISOString() },
  };
  favorites.value = favorites.value.map((f) => (f.id === fav.id ? updated : f));
  void $docs.put(TABLE, updated).catch((e: unknown) => {
    Telemetry.captureException(e, { source: "presentation_mode.online.snapshot" });
  });
}

async function loadPage(fav: OnlineFavorite, start: number, lang: string, gen: number): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const page = await listCollection(
      { kind: fav.kind as "playlist" | "channel", id: fav.ytId },
      { start, count: PAGE, lang }
    );
    if (gen !== generation) return;
    const fresh = toEntries(page.entries, page.channel || fav.channel);
    if (start === 1) {
      entries.value = fresh;
      keepSnapshot(fav, fresh, page.hasMore);
    } else {
      const known = new Set(entries.value.map((e) => e.id));
      entries.value = [...entries.value, ...fresh.filter((e) => !known.has(e.id))];
    }
    hasMore.value = page.hasMore;
  } catch (e) {
    if (gen !== generation) return;
    const kind = (e as { kind?: string }).kind;
    error.value = kind === "unsupported" ? "desktop_only" : "load_failed";
    if (kind !== "network" && kind !== "unsupported") {
      Telemetry.captureException(e, { source: "presentation_mode.online.collection", kind });
    }
  } finally {
    if (gen === generation) loading.value = false;
  }
}

/**
 * Abre os vídeos soltos ou uma playlist/canal. A cópia guardada aparece na
 * hora; `refresh` (ou a cópia velha) consulta o YouTube de novo.
 */
async function open(id: string, lang = "pt", refresh = false): Promise<void> {
  await ensureLoaded();
  const gen = ++generation;
  openId.value = id;
  hasMore.value = false;
  error.value = null;
  const fav = favorites.value.find((f) => f.id === id);
  if (!fav || fav.kind === "video") {
    openId.value = VIDEOS;
    entries.value = videoEntries();
    loading.value = false;
    return;
  }
  const snap = fav.snapshot;
  entries.value = snap?.entries ?? [];
  hasMore.value = snap?.hasMore ?? false;
  const stale = !snap || Date.now() - Date.parse(snap.fetchedAt) > STALE_MS;
  if (refresh || stale) await loadPage(fav, 1, lang, gen);
}

async function loadMore(lang: string): Promise<void> {
  const fav = openFavorite.value;
  if (!fav || loading.value || !hasMore.value) return;
  await loadPage(fav, entries.value.length + 1, lang, generation);
}

/** O vídeo foi ao ar a partir da lista aberta: ela vira a fila do Anterior/Próximo. */
function startQueue(videoId: string): void {
  const list = entries.value;
  const index = list.findIndex((e) => e.id === videoId);
  queue.value = index >= 0 ? { entries: list, index } : null;
}

function stepQueue(to: "first" | "prev" | "next" | "last"): OnlineEntry | null {
  const q = queue.value;
  if (!q) return null;
  const last = q.entries.length - 1;
  const index = to === "first" ? 0 : to === "last" ? last : to === "next" ? q.index + 1 : q.index - 1;
  if (index < 0 || index > last || index === q.index) return null;
  queue.value = { entries: q.entries, index };
  return q.entries[index];
}

export function useOnlineLibrary() {
  return {
    favorites,
    videos,
    collections,
    openId,
    openFavorite,
    entries,
    hasMore,
    loading,
    error,
    queue,
    supportsCollections: collectionsAvailable,
    ensureLoaded,
    addFromUrl,
    remove,
    reorder,
    open,
    loadMore,
    startQueue,
    stepQueue,
  };
}
