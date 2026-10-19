// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

/**
 * Núcleo do "PowerPoint fiel": descobrir quais fontes o .pptx pede, sem abrir
 * o PowerPoint, e comparar com as fontes instaladas pelo nome normalizado.
 */
const require = createRequire(import.meta.url);
const fs = require("fs-extra");
const JSZip = require("jszip");
const { norm, splitStyle, buildInstalledIndex, isInstalled, isOfficeCloud } = require("../pptx/fontNames.js");
const { readPptxFonts } = require("../pptx/pptxFonts.js");
const { renameFont } = require("../pptx/fontRename.js");
const { SCRIPT } = require("../pptx/windowsScript.js");
const { MAC_SCRIPT } = require("../pptx/converters.js");

async function pptxCom(arquivos) {
  const zip = new JSZip();
  for (const [nome, xml] of Object.entries(arquivos)) zip.file(nome, xml);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lj-pptx-"));
  const file = path.join(dir, "teste.pptx");
  await fs.writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  return { file, dir };
}

describe("fontNames", () => {
  it("normaliza espaços, hífens, acentos e o sufixo do registro", () => {
    expect(norm("Montserrat-Black")).toBe("montserratblack");
    expect(norm("Montserrat Black (TrueType)")).toBe("montserratblack");
    expect(norm("Fonte Câmbio")).toBe("fontecambio");
  });

  it("separa a família do estilo, inclusive estilo de duas palavras", () => {
    expect(splitStyle("Montserrat ExtraBold Italic")).toEqual({ base: "Montserrat", styles: ["extrabold", "italic"] });
    expect(splitStyle("Open Sans Semi Bold")).toEqual({ base: "Open Sans", styles: ["semibold"] });
  });

  it("só conta fonte cujo arquivo ainda existe", () => {
    const idx = buildInstalledIndex({
      entries: [
        { name: "Bremlin (TrueType)", exists: false },
        { name: "Arial Bold (TrueType)", exists: true },
      ],
    });
    expect(isInstalled(idx, "Bremlin")).toBe(false);
    expect(isInstalled(idx, "Arial")).toBe(true);
  });

  it("peso pesado instalado não implica a família regular", () => {
    const idx = buildInstalledIndex({ entries: [{ name: "Montserrat Black (TrueType)", exists: true }] });
    expect(isInstalled(idx, "Montserrat Black")).toBe(true);
    expect(isInstalled(idx, "Montserrat")).toBe(false);
  });

  it("reconhece as fontes de nuvem do Office", () => {
    expect(isOfficeCloud("Aptos Display")).toBe(true);
    expect(isOfficeCloud("Montserrat")).toBe(false);
  });
});

describe("readPptxFonts", () => {
  it("lê as fontes dos slides e do tema, e as embutidas", async () => {
    const { file, dir } = await pptxCom({
      "ppt/slides/slide1.xml": '<p:sld><a:latin typeface="Bricolage Grotesque ExtraBold"/><a:latin typeface="+mj-lt"/></p:sld>',
      "ppt/theme/theme1.xml": '<a:theme><a:latin typeface="Calibri"/><a:sym typeface="Wingdings"/></a:theme>',
      "ppt/presentation.xml":
        '<p:presentation><p:embeddedFontLst><p:embeddedFont><p:font typeface="Brich"/></p:embeddedFont></p:embeddedFontLst></p:presentation>',
    });
    try {
      const r = await readPptxFonts(file);
      expect(r.fonts).toEqual(["Bricolage Grotesque ExtraBold", "Calibri", "Wingdings"]);
      expect(r.embedded).toEqual(["Brich"]);
    } finally {
      await fs.remove(dir);
    }
  });
});

describe("fontRename", () => {
  it("recusa arquivo que não é fonte", () => {
    expect(() => renameFont(Buffer.from("não é fonte"), { family: "X", weight: 800, italic: false })).toThrow();
  });
});

describe("scripts embutidos", () => {
  it("o script do PowerShell não tem crase (quebraria o template do JS)", () => {
    expect(SCRIPT.includes("`")).toBe(false);
    expect(SCRIPT).toContain("ppSaveAsPDF");
  });

  it("o AppleScript salva como PDF e fecha sem salvar o original", () => {
    expect(MAC_SCRIPT).toContain("save as PDF");
    expect(MAC_SCRIPT).toContain("saving no");
  });
});
