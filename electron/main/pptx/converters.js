"use strict";

/**
 * converters — quem transforma o .pptx em PDF.
 *
 * Quem desenha é o PRÓPRIO programa de apresentação, então sai igual ao que o
 * operador vê no PowerPoint (desde que as fontes estejam instaladas — é o que
 * o `index.js` resolve antes de chamar aqui).
 *
 * Com o PowerPoint, cada slide sai como imagem e o PDF é montado só com essas
 * imagens. Um PDF "normal" do PowerPoint traz as fontes embutidas num formato
 * (CID TrueType) que o pdf.js da projeção não desenhou direito no Electron 41
 * — o título caía numa fonte qualquer. Com imagens não existe fonte a ler.
 *
 *   Windows → PowerPoint por PowerShell/COM;  sem PowerPoint → LibreOffice
 *   macOS   → PowerPoint por AppleScript;     sem PowerPoint → LibreOffice
 *   Linux   → LibreOffice (headless)
 */
const fs = require("fs/promises");
const fss = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { pathToFileURL } = require("url");
const { runWindowsTask } = require("./windowsScript.js");
const { imagesToPdf } = require("./imagesPdf.js");

/** Largura das imagens dos slides (a altura segue a proporção do slide). */
const SLIDE_WIDTH_PX = 1920;

const MAC_PPT_APP = "/Applications/Microsoft PowerPoint.app";
/** O PowerPoint do Mac roda em sandbox: só lê/grava sem pedir permissão dentro do próprio container. */
const MAC_PPT_CONTAINER = path.join(os.homedir(), "Library", "Containers", "com.microsoft.Powerpoint", "Data");

function _exec(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || stdout || err.message).trim();
        reject(new Error(msg.slice(0, 600) || err.message));
      } else resolve(String(stdout));
    });
  });
}

const _existe = (p) => {
  try {
    return fss.existsSync(p);
  } catch {
    return false;
  }
};

/** Caminho do LibreOffice (`soffice`), ou null. */
function findSoffice(platform = process.platform) {
  const candidatos = [];
  if (platform === "win32") {
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], "C:\\Program Files"]) {
      if (base) candidatos.push(path.join(base, "LibreOffice", "program", "soffice.exe"));
    }
  } else if (platform === "darwin") {
    candidatos.push("/Applications/LibreOffice.app/Contents/MacOS/soffice");
  } else {
    candidatos.push("/usr/bin/soffice", "/usr/bin/libreoffice", "/usr/local/bin/soffice", "/snap/bin/libreoffice", "/opt/libreoffice/program/soffice");
    try {
      for (const d of fss.readdirSync("/opt")) {
        if (/^libreoffice/i.test(d)) candidatos.push(path.join("/opt", d, "program", "soffice"));
      }
    } catch {
      /* sem /opt */
    }
  }
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    if (dir) candidatos.push(path.join(dir, platform === "win32" ? "soffice.exe" : "soffice"));
  }
  return candidatos.find(_existe) || null;
}

async function _windowsHasPowerPoint() {
  try {
    await _exec("reg", ["query", "HKCR\\PowerPoint.Application"], 15000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Qual conversor este computador tem.
 * @returns {Promise<{id: "powerpoint"|"libreoffice"|null, label: string, soffice?: string}>}
 */
async function detectConverter(platform = process.platform) {
  if (platform === "win32" && (await _windowsHasPowerPoint())) return { id: "powerpoint", label: "PowerPoint" };
  if (platform === "darwin" && _existe(MAC_PPT_APP)) return { id: "powerpoint", label: "PowerPoint" };
  const soffice = findSoffice(platform);
  if (soffice) return { id: "libreoffice", label: "LibreOffice", soffice };
  return { id: null, label: "" };
}

// ── PowerPoint no Windows ──────────────────────────────────────────────────
/**
 * Cópia do arquivo SEM a marca "baixado da internet".
 *
 * O Windows grava essa marca (Zone.Identifier) em tudo que vem do navegador,
 * WhatsApp ou e-mail, e o PowerPoint abre esses arquivos no "Modo de Exibição
 * Protegido" — onde a automação falha com um E_FAIL sem explicação. Copiar
 * byte a byte (stream, não CopyFile) gera um arquivo novo sem a marca; o
 * original do operador fica como está.
 */
async function _copiaSemMarca(input, dir) {
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `entrada${path.extname(input).toLowerCase()}`);
  await new Promise((resolve, reject) => {
    const r = fss.createReadStream(input);
    const w = fss.createWriteStream(dest);
    r.on("error", reject);
    w.on("error", reject);
    w.on("finish", resolve);
    r.pipe(w);
  });
  return dest;
}

async function _windowsPowerPoint(input, output, opts) {
  const outDir = path.join(opts.tempDir, `png-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    const copia = await _copiaSemMarca(input, path.join(outDir, "in"));
    const res = await runWindowsTask(
      "convert",
      {
        input: copia,
        outDir,
        width: SLIDE_WIDTH_PX,
        withWindow: !!opts.withWindow,
        restartIfIdle: !!opts.fontsChanged,
      },
      { tempDir: opts.tempDir, timeoutMs: 10 * 60 * 1000, onProgress: opts.onSlide }
    );
    const nomes = Array.isArray(res.files) ? res.files : res.files ? [res.files] : [];
    const imagens = nomes.map((n) => path.join(outDir, path.basename(String(n))));
    if (!imagens.length) throw new Error("O PowerPoint não exportou nenhum slide.");
    await imagesToPdf(imagens, output, { width: Number(res.slideWidth), height: Number(res.slideHeight) });
    return { staleFonts: !!res.staleFonts };
  } finally {
    fs.rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── PowerPoint no Mac ──────────────────────────────────────────────────────
const MAC_SCRIPT = `
on run argv
  set inPath to item 1 of argv
  set outPath to item 2 of argv
  set restartIdle to (item 3 of argv) is "1"
  set inFile to POSIX file inPath
  set outFile to (POSIX file outPath) as text
  set wasRunning to application "Microsoft PowerPoint" is running
  set stale to "0"
  if wasRunning and restartIdle then
    tell application "Microsoft PowerPoint" to set n to count of presentations
    if n is 0 then
      tell application "Microsoft PowerPoint" to quit
      delay 2
      set wasRunning to false
    else
      set stale to "1"
    end if
  end if
  tell application "Microsoft PowerPoint"
    open inFile
    set pres to active presentation
    save pres in outFile as save as PNG
    close pres saving no
    if not wasRunning then quit
  end tell
  return stale
end run
`;

async function _macPowerPoint(input, output, opts) {
  // Igual ao Windows: cada slide vira PNG e o PDF é montado aqui.
  // Copia para dentro do container do PowerPoint: fora dele o macOS pede
  // "Conceder acesso" a cada arquivo novo e a automação fica parada esperando.
  const base = _existe(MAC_PPT_CONTAINER) ? path.join(MAC_PPT_CONTAINER, "tmp", "louvorja") : opts.tempDir;
  await fs.mkdir(base, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tmpIn = path.join(base, `${id}${path.extname(input).toLowerCase()}`);
  const tmpOut = path.join(base, `${id}-slides`);
  await fs.copyFile(input, tmpIn);
  try {
    const out = await _exec("osascript", ["-e", MAC_SCRIPT, tmpIn, tmpOut, opts.fontsChanged ? "1" : "0"], 10 * 60 * 1000);
    // O PowerPoint do Mac cria uma pasta com "Slide1.png", "Slide2.png"…
    const imagens = (await _listarPngs(base)).filter((f) => f.startsWith(tmpOut));
    if (!imagens.length) throw new Error("O PowerPoint não exportou nenhum slide.");
    await imagesToPdf(imagens, output);
    return { staleFonts: out.trim() === "1" };
  } catch (e) {
    if (/-1743|not authori[sz]ed|não autorizado/i.test(e.message)) {
      throw new Error(
        "O macOS bloqueou o controle do PowerPoint. Abra Ajustes do Sistema → Privacidade e Segurança → Automação e permita o LouvorJA controlar o Microsoft PowerPoint."
      );
    }
    throw e;
  } finally {
    fs.unlink(tmpIn).catch(() => {});
    fs.rm(tmpOut, { recursive: true, force: true }).catch(() => {});
  }
}

/** PNGs de uma pasta (recursivo), na ordem natural: Slide2 antes de Slide10. */
async function _listarPngs(dir) {
  const out = [];
  for (const it of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...(await _listarPngs(p)));
    else if (/\.png$/i.test(it.name)) out.push(p);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// ── LibreOffice (Linux, ou quem não tem PowerPoint) ───────────────────────
async function _libreOffice(input, output, opts) {
  const soffice = opts.soffice || findSoffice();
  if (!soffice) throw new Error("LibreOffice não encontrado.");
  const work = path.join(opts.tempDir, `lo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  // Perfil próprio: com um LibreOffice já aberto, o --headless entregaria o
  // trabalho para ele e voltaria sem converter nada.
  const profile = path.join(opts.tempDir, "lo-profile");
  await fs.mkdir(work, { recursive: true });
  const tmpIn = path.join(work, `apresentacao${path.extname(input).toLowerCase()}`);
  await fs.copyFile(input, tmpIn);
  try {
    await _exec(
      soffice,
      [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--convert-to",
        "pdf",
        "--outdir",
        work,
        tmpIn,
      ],
      10 * 60 * 1000
    );
    const pdf = path.join(work, "apresentacao.pdf");
    if (!_existe(pdf)) throw new Error("O LibreOffice não gerou o PDF.");
    await fs.copyFile(pdf, output);
    return { staleFonts: false };
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Converte. `output` é sobrescrito.
 * @param {{id: string, soffice?: string}} converter  vindo de `detectConverter`
 * @param {string} input
 * @param {string} output
 * @param {{tempDir: string, fontsChanged?: boolean, withWindow?: boolean, platform?: string,
 *   onSlide?: (p: {done: number, total: number}) => void}} opts  onSlide: contagem dos slides (PowerPoint no Windows)
 * @returns {Promise<{staleFonts: boolean}>}  staleFonts = o PowerPoint já estava com
 *   apresentação aberta e não pôde reiniciar para ler as fontes recém-instaladas
 */
async function convertToPdf(converter, input, output, opts) {
  const platform = opts.platform || process.platform;
  if (converter.id === "powerpoint") {
    return platform === "win32" ? _windowsPowerPoint(input, output, opts) : _macPowerPoint(input, output, opts);
  }
  if (converter.id === "libreoffice") return _libreOffice(input, output, { ...opts, soffice: converter.soffice });
  throw new Error("Nenhum conversor disponível.");
}

module.exports = { detectConverter, convertToPdf, findSoffice, MAC_SCRIPT, SLIDE_WIDTH_PX };
