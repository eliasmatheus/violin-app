import type { SeriesDoc, SeriesPlay } from "@/types/Series";

/**
 * Regras de uma série de vídeos: o que já passou no ciclo atual, qual é o
 * próximo e o que acontece quando todos passaram. Tudo puro — quem grava é o
 * main, na pasta da série.
 */

export function newSeries(name: string, onEnd: SeriesDoc["onEnd"], now: string): SeriesDoc {
  return { version: 1, active: true, name, onEnd, cycle: 1, updatedAt: now, plays: [] };
}

/** A última exibição de cada vídeo no ciclo atual, sem as desmarcadas. */
export function playedInCycle(doc: SeriesDoc): Map<string, SeriesPlay> {
  const played = new Map<string, SeriesPlay>();
  for (const p of doc.plays) {
    if (p.undone || p.cycle !== doc.cycle) continue;
    const known = played.get(p.file);
    if (!known || known.at < p.at) played.set(p.file, p);
  }
  return played;
}

export interface SeriesProgress {
  /** O primeiro vídeo (na ordem da pasta) que ainda não passou neste ciclo. */
  next: string | null;
  played: number;
  total: number;
  /** Todos passaram: recomeçar ou sugerir outra série, conforme `onEnd`. */
  completed: boolean;
}

export function progressOf(doc: SeriesDoc, files: string[]): SeriesProgress {
  const played = playedInCycle(doc);
  const count = files.filter((f) => played.has(f)).length;
  const next = files.find((f) => !played.has(f)) ?? null;
  return { next, played: count, total: files.length, completed: files.length > 0 && next === null };
}

export function withPlay(doc: SeriesDoc, file: string, id: string, now: string): SeriesDoc {
  return { ...doc, updatedAt: now, plays: [...doc.plays, { id, file, at: now, cycle: doc.cycle }] };
}

/** Desmarca as exibições do vídeo neste ciclo (passou por engano). */
export function withoutPlay(doc: SeriesDoc, file: string, now: string): SeriesDoc {
  return {
    ...doc,
    updatedAt: now,
    plays: doc.plays.map((p) => (p.file === file && p.cycle === doc.cycle && !p.undone ? { ...p, undone: true } : p)),
  };
}

/** Novo ciclo: todos os vídeos voltam a estar disponíveis; o histórico antigo fica. */
export function withNewCycle(doc: SeriesDoc, now: string): SeriesDoc {
  return { ...doc, cycle: doc.cycle + 1, updatedAt: now };
}

/** Pasta e nome do arquivo, em qualquer sistema. */
export function splitPath(path: string): { dir: string; file: string } {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return { dir: path.slice(0, i), file: path.slice(i + 1) };
}
