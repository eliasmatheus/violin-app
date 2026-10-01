"use strict";

/**
 * Histórico de uma série de vídeos (Momento Saúde, Provai e Vede…), gravado
 * dentro da própria pasta da série, ao lado dos vídeos.
 *
 * A pasta costuma estar numa pasta compartilhada na nuvem (OneDrive, Google Drive, iCloud…): o histórico vai
 * junto com os vídeos para o computador da igreja e para o do operador, sem
 * servidor. Dois computadores podem gravar perto um do outro, então gravar não
 * sobrescreve — junta o que está no disco com o que chegou: as exibições se
 * somam pelo id, e "desmarcar" é uma marca que também se propaga.
 */

const fs = require("fs-extra");
const path = require("path");

const FILE_NAME = ".louvorja-serie.json";
/**
 * Cópias que o sincronizador cria quando dois computadores gravam antes de
 * sincronizar. O OneDrive acrescenta o nome do computador
 * (`.louvorja-serie-IGREJA-PC.json`); outros usam "(cópia em conflito…)".
 */
const CONFLICT_RE = /^\.louvorja-serie.+\.json$/i;
const MAX_PLAYS = 5000;
const ON_END = new Set(["restart", "suggest_new"]);

function validDir(dir) {
  return typeof dir === "string" && dir.length > 0 && path.isAbsolute(dir);
}

const str = (v, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

/** Só o que o formato conhece, com tipos conferidos: o arquivo pode ter sido editado à mão. */
function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const plays = (Array.isArray(raw.plays) ? raw.plays : [])
    .filter((p) => p && typeof p.id === "string" && typeof p.file === "string" && typeof p.at === "string")
    .slice(-MAX_PLAYS)
    .map((p) => ({
      id: str(p.id, 64),
      file: str(p.file, 500),
      at: str(p.at, 40),
      cycle: Number.isSafeInteger(p.cycle) && p.cycle > 0 ? p.cycle : 1,
      ...(p.undone === true ? { undone: true } : {}),
    }));
  return {
    version: 1,
    active: raw.active !== false,
    name: str(raw.name, 120),
    onEnd: ON_END.has(raw.onEnd) ? raw.onEnd : "restart",
    cycle: Number.isSafeInteger(raw.cycle) && raw.cycle > 0 ? raw.cycle : 1,
    updatedAt: str(raw.updatedAt, 40),
    plays,
  };
}

/** Junta duas versões do mesmo histórico: nenhuma exibição se perde, e desmarcar vence. */
function merge(disk, incoming) {
  if (!disk) return incoming;
  const byId = new Map();
  for (const p of [...disk.plays, ...incoming.plays]) {
    const known = byId.get(p.id);
    byId.set(p.id, known ? { ...known, ...(p.undone || known.undone ? { undone: true } : {}) } : p);
  }
  const plays = [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_PLAYS);
  // As configurações valem as da gravação mais recente; o ciclo só anda para frente.
  const newer = incoming.updatedAt >= disk.updatedAt ? incoming : disk;
  return { ...newer, cycle: Math.max(disk.cycle, incoming.cycle), plays };
}

async function readFile(dir, name = FILE_NAME) {
  try {
    return normalize(await fs.readJson(path.join(dir, name)));
  } catch {
    return null;
  }
}

async function conflictNames(dir) {
  try {
    const names = await fs.readdir(dir);
    return names.filter((n) => n !== FILE_NAME && CONFLICT_RE.test(n) && !n.endsWith(".tmp"));
  } catch {
    return [];
  }
}

/** O que o operador precisa para escolher uma versão: quando mudou, quantos passaram, o último. */
async function describe(dir, name) {
  const doc = await readFile(dir, name);
  if (!doc) return null;
  let modifiedAt = doc.updatedAt;
  try {
    modifiedAt = (await fs.stat(path.join(dir, name))).mtime.toISOString();
  } catch {
    /* fica a data gravada no próprio histórico */
  }
  const valid = doc.plays.filter((p) => !p.undone);
  const last = valid.reduce((acc, p) => (!acc || p.at > acc.at ? p : acc), null);
  return {
    name,
    modifiedAt,
    plays: valid.length,
    lastPlay: last ? { file: last.file, at: last.at } : null,
  };
}

/**
 * @param {unknown} dir pasta da série (caminho absoluto)
 * @returns {Promise<{ ok: true, series: object | null, versions: object[] } | { ok: false, error: string }>}
 *   `versions` só vem quando há cópias em conflito: a principal primeiro, depois as cópias.
 */
async function read(dir) {
  if (!validDir(dir)) return { ok: false, error: "invalid_path" };
  const series = await readFile(dir);
  const conflicts = await conflictNames(dir);
  const versions = conflicts.length
    ? (await Promise.all([FILE_NAME, ...conflicts].map((n) => describe(dir, n)))).filter(Boolean)
    : [];
  return { ok: true, series, versions };
}

/**
 * Resolve o conflito: `"merge"` junta todas as versões (nenhuma exibição se
 * perde); um nome de arquivo usa só aquela versão. As cópias saem da pasta.
 * @param {unknown} dir
 * @param {unknown} choice
 */
async function resolve(dir, choice) {
  if (!validDir(dir)) return { ok: false, error: "invalid_path" };
  const conflicts = await conflictNames(dir);
  const names = [FILE_NAME, ...conflicts];
  if (choice !== "merge" && !names.includes(choice)) return { ok: false, error: "invalid_choice" };
  const docs = (await Promise.all(names.map((n) => readFile(dir, n)))).filter(Boolean);
  let result;
  if (choice === "merge") {
    result = docs.reduce((acc, d) => merge(acc, d), null);
  } else {
    result = await readFile(dir, choice);
  }
  if (!result) return { ok: false, error: "invalid_data" };
  try {
    const target = path.join(dir, FILE_NAME);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeJson(tmp, { ...result, updatedAt: new Date().toISOString() }, { spaces: 2 });
    await fs.move(tmp, target, { overwrite: true });
    await Promise.all(conflicts.map((n) => fs.remove(path.join(dir, n))));
    return { ok: true, series: await readFile(dir) };
  } catch {
    return { ok: false, error: "unwritable" };
  }
}

/**
 * Grava (juntando com o que já está no disco) e devolve o histórico resultante.
 * @param {unknown} dir
 * @param {unknown} data
 */
async function write(dir, data) {
  if (!validDir(dir)) return { ok: false, error: "invalid_path" };
  const incoming = normalize(data);
  if (!incoming) return { ok: false, error: "invalid_data" };
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return { ok: false, error: "not_a_folder" };
    const merged = merge(await readFile(dir), incoming);
    const target = path.join(dir, FILE_NAME);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeJson(tmp, merged, { spaces: 2 });
    await fs.move(tmp, target, { overwrite: true });
    return { ok: true, series: merged };
  } catch (e) {
    return { ok: false, error: e && e.code === "ENOENT" ? "not_found" : "unwritable" };
  }
}

module.exports = { read, write, resolve, merge, normalize, FILE_NAME };
