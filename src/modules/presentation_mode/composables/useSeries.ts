import { onBeforeUnmount, reactive, watch } from "vue";
import Platform from "@/helpers/Platform";
import Telemetry from "@/helpers/Telemetry";
import { useAudioPlayback } from "@/composables/useAudioPlayback";
import { kindFromPath } from "../program/liturgy";
import type { SeriesDoc, SeriesVersion } from "@/types/Series";
import { newId } from "./useProgram";
import { newSeries, splitPath, withNewCycle, withoutPlay, withPlay } from "../program/series";

/**
 * Séries de vídeos da biblioteca: cada pasta pode ser uma, com o histórico do
 * que já passou gravado dentro dela. O estado aqui é o que foi lido de cada
 * pasta; toda mudança passa pelo main, que junta com o que está no disco —
 * outro computador pode ter gravado na mesma pasta na nuvem.
 */

/** Pasta → série (null: a pasta não é série). Ausente: ainda não lida. */
const docs = reactive(new Map<string, SeriesDoc | null>());
/** Pasta → versões em conflito que o sincronizador deixou (vazio: nenhum conflito). */
const conflicts = reactive(new Map<string, SeriesVersion[]>());

async function load(dir: string): Promise<SeriesDoc | null> {
  const res = await Platform.seriesRead(dir).catch(() => null);
  const series = res?.ok ? res.series : null;
  docs.set(dir, series?.active ? series : null);
  conflicts.set(dir, res?.ok ? res.versions : []);
  return docs.get(dir) ?? null;
}

/** Junta todas as versões (`"merge"`) ou fica com a escolhida; as cópias saem da pasta. */
async function resolve(dir: string, choice: string): Promise<boolean> {
  const res = await Platform.seriesResolve(dir, choice).catch(() => null);
  if (!res?.ok) return false;
  Telemetry.track("presentation_series_conflict_resolved", { merged: choice === "merge" });
  docs.set(dir, res.series?.active ? res.series : null);
  conflicts.set(dir, []);
  return true;
}

async function save(dir: string, doc: SeriesDoc): Promise<boolean> {
  const res = await Platform.seriesWrite(dir, doc).catch(() => null);
  if (!res?.ok) {
    Telemetry.track("presentation_series_write_failed", { error: res?.error ?? "exception" });
    return false;
  }
  docs.set(dir, res.series.active ? res.series : null);
  return true;
}

const now = () => new Date().toISOString();

function create(dir: string, name: string, onEnd: SeriesDoc["onEnd"]): Promise<boolean> {
  return save(dir, newSeries(name, onEnd, now()));
}

async function update(dir: string, change: (doc: SeriesDoc) => SeriesDoc): Promise<boolean> {
  const doc = docs.get(dir) ?? (await load(dir));
  return doc ? save(dir, change(doc)) : false;
}

/** O vídeo passou no culto: entra no histórico da série da pasta dele, se houver. */
async function record(path: string): Promise<void> {
  const { dir, file } = splitPath(path);
  await update(dir, (doc) => withPlay(doc, file, newId(), now()));
}

export function useSeries() {
  return {
    docs,
    of: (dir: string | null | undefined) => (dir ? (docs.get(dir) ?? null) : null),
    conflictsOf: (dir: string | null | undefined) => (dir ? (conflicts.get(dir) ?? []) : []),
    resolve,
    load,
    create,
    record,
    update,
    /** Passou por engano: o vídeo volta a estar disponível. */
    unmark: (dir: string, file: string) => update(dir, (doc) => withoutPlay(doc, file, now())),
    markPlayed: (dir: string, file: string) => update(dir, (doc) => withPlay(doc, file, newId(), now())),
    restart: (dir: string) => update(dir, (doc) => withNewCycle(doc, now())),
    /** A pasta deixa de ser série; o histórico fica no arquivo, desativado. */
    disable: (dir: string) => update(dir, (doc) => ({ ...doc, active: false, updatedAt: now() })),
  };
}

/** Quanto do vídeo precisa tocar para contar como "passou": um clique errado, logo trocado, não gasta o vídeo. */
export const PLAYED_AFTER_SECONDS = 15;
const PLAYED_FRACTION = 0.8;

/** 15 s de reprodução — ou 80% de um vídeo mais curto que isso. */
export function playedThreshold(duration: number): number {
  return duration > 0 ? Math.min(PLAYED_AFTER_SECONDS, duration * PLAYED_FRACTION) : PLAYED_AFTER_SECONDS;
}

/**
 * Registra na série o arquivo que ficou no ar. Vídeo conta pelo tempo que de
 * fato tocou (pausado não conta); imagem, pelo tempo na tela. Quem não está
 * numa pasta de série é ignorado no main.
 */
export function useSeriesRecorder(livePath: () => string | null): void {
  const audio = useAudioPlayback();
  let recorded: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const done = (path: string) => {
    recorded = path;
    clearTimer();
    void record(path);
  };

  const stopPath = watch(livePath, (path) => {
    clearTimer();
    if (path !== recorded) recorded = null;
    if (path && kindFromPath(path) === "image") {
      timer = setTimeout(() => livePath() === path && done(path), PLAYED_AFTER_SECONDS * 1000);
    }
  });
  const stopTime = watch(
    () => [audio.currentTime.value, audio.duration.value] as const,
    ([time, duration]) => {
      const path = livePath();
      if (!path || path === recorded || kindFromPath(path) === "image") return;
      if (Number.isFinite(time) && time >= playedThreshold(Number.isFinite(duration) ? duration : 0)) done(path);
    }
  );
  onBeforeUnmount(() => {
    stopPath();
    stopTime();
    clearTimer();
  });
}
