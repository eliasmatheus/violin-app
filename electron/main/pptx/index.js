"use strict";

/**
 * pptx — PowerPoint fiel no LouvorJA.
 *
 * Um .pptx distorce quando o computador do culto não tem as fontes de quem
 * fez os slides. Aqui o arquivo vira um PDF desenhado pelo próprio PowerPoint
 * (ou LibreOffice), DEPOIS de garantir as fontes:
 *
 *   1. lê as fontes que o .pptx usa (sem abrir o PowerPoint)
 *   2. as que vêm EMBUTIDAS no arquivo são extraídas e instaladas
 *   3. as que faltam são baixadas do Google Fonts (quando existem lá)
 *   4. o PowerPoint salva como PDF em `files/pptx/`
 *
 * O PDF entra na Biblioteca de Mídia como qualquer outro PDF — e a projeção
 * de arquivo já leva PDF para o telão (PA) e para o retorno.
 *
 * Cache: `files/pptx/<hash do arquivo>-<assinatura das fontes>.pdf` + `.json`;
 * fontes baixadas/extraídas ficam em `files/pptx/fonts/`.
 * Mudou o arquivo, ou uma fonte que faltava foi instalada → converte de novo.
 */
const fs = require("fs/promises");
const fss = require("fs");
const path = require("path");
const crypto = require("crypto");
const paths = require("../paths.js");
const { readPptxFonts, extractEmbeddedFonts } = require("./pptxFonts.js");
const { norm, isInstalled, isOfficeCloud } = require("./fontNames.js");
const { readFontNames } = require("./fontFiles.js");
const { GoogleFontsSource } = require("./googleFonts.js");
const { renameFont } = require("./fontRename.js");
const { SystemFonts } = require("./systemFonts.js");
const { detectConverter, convertToPdf } = require("./converters.js");

/** Extensões aceitas. Só as baseadas em ZIP (OOXML) têm leitura de fontes. */
const PPT_EXT = [".pptx", ".ppsx", ".pptm", ".ppt", ".pps", ".odp"];
const OOXML_EXT = [".pptx", ".ppsx", ".pptm"];
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB — apresentação com vídeo pesado

const FETCH_TIMEOUT_MS = 20000;

/** Sobe quando o formato do PDF muda (v2: slides como imagem) — o cache antigo deixa de valer. */
const CACHE_VERSION = 2;

/** `fetch` do Node com tempo limite (regra do AGENTS.md para o processo main). */
async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function _outDir() {
  return path.join(paths.filesDir(), "pptx");
}
function _fontCacheDir() {
  return path.join(paths.filesDir(), "pptx", "fonts");
}
function _tempDir() {
  return path.join(paths.tempDir(), "pptx");
}

/** @type {SystemFonts|null} */
let _system = null;
/** @type {GoogleFontsSource|null} */
let _google = null;
/** Uma conversão por vez: o PowerPoint automatizado não gosta de dois pedidos juntos. */
let _fila = Promise.resolve();

function _systemFonts() {
  if (!_system) _system = new SystemFonts({ cacheDir: _fontCacheDir(), tempDir: _tempDir() });
  return _system;
}
function _googleFonts() {
  if (!_google) _google = new GoogleFontsSource({ fetch: fetchWithTimeout, cacheDir: _fontCacheDir() });
  return _google;
}

async function _sha1File(file) {
  const hash = crypto.createHash("sha1");
  await new Promise((resolve, reject) => {
    fss.createReadStream(file).on("data", (d) => hash.update(d)).on("end", resolve).on("error", reject);
  });
  return hash.digest("hex");
}

const _signature = (items) =>
  crypto
    .createHash("sha1")
    .update(items.map((i) => `${norm(i.name)}:${i.status === "missing" || i.status === "unmatched" ? 0 : 1}`).join(","))
    .digest("hex")
    .slice(0, 8);

/**
 * Valida o caminho que veio do renderer.
 * @returns {Promise<{ok: true, file: string, size: number} | {ok: false, code: string, message: string}>}
 */
async function validateInput(raw) {
  if (typeof raw !== "string" || !raw || raw.length > 4096 || raw.includes("\0")) {
    return { ok: false, code: "invalid_file", message: "Arquivo inválido." };
  }
  const file = path.resolve(raw);
  if (!PPT_EXT.includes(path.extname(file).toLowerCase())) {
    return { ok: false, code: "invalid_file", message: "Escolha um arquivo do PowerPoint (.pptx)." };
  }
  let st;
  try {
    st = await fs.stat(file);
  } catch {
    return { ok: false, code: "not_found", message: "Arquivo não encontrado." };
  }
  if (!st.isFile() || st.size > MAX_BYTES) {
    return { ok: false, code: "invalid_file", message: "Arquivo inválido." };
  }
  return { ok: true, file, size: st.size };
}

// ── Fontes ────────────────────────────────────────────────────────────────

/**
 * Descobre as fontes do arquivo e instala as que faltam.
 * @returns {Promise<{items: {name: string, status: string, source: string|null}[], installed: number, embedded: boolean}>}
 */
async function ensureFonts(file, onProgress, log) {
  const report = { items: [], installed: 0, embedded: false };
  if (!OOXML_EXT.includes(path.extname(file).toLowerCase())) return report;

  const { fonts, embedded } = await readPptxFonts(file);
  report.embedded = embedded.length > 0;
  const system = _systemFonts();
  let idx = await system.index(fonts);
  report.items = fonts.map((name) => ({
    name,
    status: isInstalled(idx, name) ? "ok" : isOfficeCloud(name) ? "office" : "missing",
    source: null,
  }));

  // Lista completa logo de cara: a janela do operador mostra todas as fontes,
  // não só as que precisam de ação.
  onProgress({ phase: "fonts", fonts: report.items.map((i) => ({ ...i })) });

  const emb = new Set(embedded.map(norm));
  const faltando = report.items.filter((i) => i.status === "missing");
  if (!faltando.length) return report;

  const cache = _fontCacheDir();
  const instalar = async (item, files, source, temporary = false) => {
    const fonts = [];
    for (const f of files) {
      const n = await readFontNames(f);
      fonts.push({ path: f, registryName: n.registryName, names: [n.family, n.full, n.typo, item.name].filter(Boolean) });
    }
    const ok = await system.install(fonts, { temporary });
    if (ok) {
      report.installed += ok;
      item.status = "installed";
      item.source = source;
    }
    onProgress({ phase: "font", name: item.name, status: item.status, source });
  };

  // 1) EMBUTIDAS no próprio .pptx — respeitando a permissão gravada na fonte
  const embutidas = faltando.filter((i) => emb.has(norm(i.name)));
  if (embutidas.length) {
    let extraidas = [];
    try {
      extraidas = await extractEmbeddedFonts(file, embutidas.map((i) => i.name));
    } catch (e) {
      log("[pptx] fontes embutidas:", e.message);
    }
    const dir = path.join(cache, "embedded");
    await fs.mkdir(dir, { recursive: true });
    for (const item of embutidas) {
      // fsType 2 = licença restrita: não pode instalar
      const partes = extraidas.filter((x) => x.typeface === item.name && (x.fsType & 0x000f) !== 0x0002);
      if (!partes.length) continue;
      const files = [];
      for (const x of partes) {
        const safe = `${item.name}-${x.style}`.replace(/[\\/:*?"<>|]/g, "_");
        const hash = crypto.createHash("sha1").update(x.ttf).digest("hex").slice(0, 8);
        const f = path.join(dir, `${safe}-${hash}.ttf`);
        await fs.writeFile(f, x.ttf);
        files.push(f);
      }
      // fsType 4 = "visualizar e imprimir": só nesta sessão do Windows
      const temporary = partes.every((x) => (x.fsType & 0x000f) === 0x0004);
      try {
        await instalar(item, files, "embedded", temporary);
      } catch (e) {
        log("[pptx] não instalou a fonte embutida", item.name, e.message);
      }
    }
    // A que não pôde ser instalada (licença restrita) o PowerPoint ainda usa de dentro do arquivo.
    for (const item of embutidas) if (item.status === "missing") item.status = "embedded";
  }

  // 2) Google Fonts
  for (const item of report.items.filter((i) => i.status === "missing")) {
    onProgress({ phase: "font", name: item.name, status: "searching", source: null });
    try {
      const achados = await _googleFonts().find(item.name);
      if (!achados.length) {
        onProgress({ phase: "font", name: item.name, status: "missing", source: null });
        continue;
      }
      const dir = path.join(cache, "google");
      await fs.mkdir(dir, { recursive: true });
      const files = [];
      for (const f of achados) {
        const dest = path.join(dir, f.fileName.replace(/[\\/:*?"<>|]/g, "_"));
        if (!fss.existsSync(dest)) {
          const res = await fetchWithTimeout(f.url, { headers: f.headers || {} });
          if (!res.ok) continue;
          let buf = Buffer.from(await res.arrayBuffer());
          try {
            buf = renameFont(buf, f.rename);
          } catch (e) {
            log("[pptx] não renomeou", f.fileName, e.message);
          }
          await fs.writeFile(dest, buf);
        }
        files.push(dest);
      }
      if (files.length) await instalar(item, files, "google");
    } catch (e) {
      log("[pptx] fonte", item.name, e.message);
      onProgress({ phase: "font", name: item.name, status: "missing", source: null });
    }
  }

  // Confere: a fonte instalada tem mesmo o nome que o .pptx pede?
  if (report.installed) {
    idx = await system.index(report.items.map((i) => i.name));
    for (const item of report.items) {
      if (item.status === "installed" && !isInstalled(idx, item.name)) item.status = "unmatched";
    }
  }
  return report;
}

// ── Conversão ─────────────────────────────────────────────────────────────

/**
 * @typedef {{name: string, status: "ok"|"office"|"embedded"|"installed"|"missing"|"unmatched", source: string|null}} PptxFont
 * @typedef {{ok: true, path: string, cached: boolean, converter: string, fonts: PptxFont[], staleFonts: boolean}
 *   | {ok: false, code: string, message: string}} PptxResult
 */

/**
 * Converte um .pptx em PDF fiel.
 * @param {string} rawPath  caminho vindo do renderer (validado aqui)
 * @param {{onProgress?: (p: object) => void, log?: (...a: any[]) => void}} [opts]
 * @returns {Promise<PptxResult>}
 */
function convert(rawPath, opts = {}) {
  const run = _fila.then(() => _convert(rawPath, opts));
  _fila = run.catch(() => {});
  return run;
}

async function _convert(rawPath, { onProgress = () => {}, log = console.log } = {}) {
  const v = await validateInput(rawPath);
  if (!v.ok) return v;
  const { file } = v;

  const converter = await detectConverter();
  if (!converter.id) {
    return {
      ok: false,
      code: "no_converter",
      message:
        process.platform === "linux"
          ? "Para abrir PowerPoint no Linux, instale o LibreOffice (sudo apt install libreoffice-impress)."
          : "Para abrir PowerPoint, instale o Microsoft PowerPoint ou o LibreOffice.",
    };
  }

  onProgress({ phase: "fonts" });
  let report = { items: [], installed: 0, embedded: false };
  try {
    report = await ensureFonts(file, onProgress, log);
  } catch (e) {
    // Sem a análise de fontes ainda dá para converter — só não há garantia.
    log("[pptx] análise de fontes falhou:", e.message);
  }

  const outDir = _outDir();
  await fs.mkdir(outDir, { recursive: true });
  const hash = (await _sha1File(file)).slice(0, 16);
  const base = `${hash}-${_signature(report.items)}-${converter.id}-v${CACHE_VERSION}`;
  const pdf = path.join(outDir, `${base}.pdf`);
  const meta = path.join(outDir, `${base}.json`);
  if (fss.existsSync(pdf) && fss.existsSync(meta)) {
    return { ok: true, path: pdf, cached: true, converter: converter.label, fonts: report.items, staleFonts: false };
  }

  onProgress({ phase: "converting", converter: converter.label });
  // termina em .pdf: o PowerPoint acrescenta ".pdf" a um nome com outra extensão
  const tmp = path.join(outDir, `${base}.${process.pid}.tmp.pdf`);
  try {
    const r = await convertToPdf(converter, file, tmp, {
      tempDir: _tempDir(),
      fontsChanged: report.installed > 0,
      withWindow: report.embedded,
    });
    const head = Buffer.alloc(5);
    const fd = await fs.open(tmp, "r");
    await fd.read(head, 0, 5, 0);
    await fd.close();
    if (head.toString("latin1") !== "%PDF-") throw new Error("O arquivo gerado não é um PDF.");
    await fs.rename(tmp, pdf);
    // Com o PowerPoint ocupado, as fontes novas podem não ter entrado: não guarda no cache.
    if (!r.staleFonts) {
      await fs.writeFile(
        meta,
        JSON.stringify({ source: path.basename(file), converter: converter.id, fonts: report.items, createdAt: Date.now() })
      );
    }
    onProgress({ phase: "done" });
    return { ok: true, path: pdf, cached: false, converter: converter.label, fonts: report.items, staleFonts: r.staleFonts };
  } catch (e) {
    fs.unlink(tmp).catch(() => {});
    log("[pptx] conversão falhou:", e.message);
    return { ok: false, code: "convert_failed", message: String(e.message || e).slice(0, 600) };
  }
}

/**
 * Instala arquivos de fonte escolhidos pelo operador (.ttf/.otf), para o caso
 * de uma fonte que não está embutida nem no Google Fonts.
 * @param {string[]} files  caminhos vindos do diálogo nativo do main
 * @returns {Promise<{ok: true, installed: number} | {ok: false, code: string, message: string}>}
 */
async function installFontFiles(files) {
  const lista = (Array.isArray(files) ? files : []).filter(
    (f) => typeof f === "string" && /\.(ttf|otf)$/i.test(f) && fss.existsSync(f)
  );
  if (!lista.length) return { ok: false, code: "no_fonts", message: "Nenhum arquivo .ttf ou .otf." };
  const fonts = [];
  for (const f of lista) {
    const n = await readFontNames(f);
    fonts.push({ path: f, registryName: n.registryName, names: [n.family, n.full, n.typo].filter(Boolean) });
  }
  try {
    const installed = await _systemFonts().install(fonts);
    return { ok: true, installed };
  } catch (e) {
    return { ok: false, code: "install_failed", message: String(e.message || e).slice(0, 400) };
  }
}

/** O que este computador consegue fazer (para a interface explicar antes de tentar). */
async function status() {
  const c = await detectConverter();
  return { ok: true, converter: c.label || null, platform: process.platform };
}

module.exports = { convert, status, installFontFiles, validateInput, fetchWithTimeout, PPT_EXT };
