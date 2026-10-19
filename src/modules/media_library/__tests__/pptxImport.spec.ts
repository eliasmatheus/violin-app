import { describe, expect, it } from "vitest";
import {
  PPT_ACCEPT,
  isPowerPointName,
  missingFonts,
  parseConvertResult,
  progressDetail,
} from "../pptxImport";

describe("pptxImport", () => {
  it("reconhece apresentações pela extensão", () => {
    expect(isPowerPointName("Culto.PPTX")).toBe(true);
    expect(isPowerPointName("louvor.ppsx")).toBe(true);
    expect(isPowerPointName("slides.pdf")).toBe(false);
    expect(isPowerPointName("pptx")).toBe(false);
    expect(isPowerPointName("")).toBe(false);
    expect(PPT_ACCEPT).toContain(".pptx");
  });

  it("aceita só resposta de sucesso com caminho de PDF", () => {
    const ok = parseConvertResult({
      ok: true,
      path: "C:/dados/files/pptx/a.pdf",
      fonts: [{ name: "Brich", status: "installed" }],
    });
    expect(ok.ok).toBe(true);
    const ruim = parseConvertResult({ ok: true, path: "C:/virus.exe" });
    expect(ruim.ok).toBe(false);
    const falha = parseConvertResult({
      ok: false,
      code: "no_converter",
      message: "Instale o LibreOffice",
    });
    expect(falha).toEqual({ ok: false, code: "no_converter", message: "Instale o LibreOffice" });
    expect(parseConvertResult(null).ok).toBe(false);
  });

  it("lista as fontes que continuam faltando", () => {
    expect(
      missingFonts([
        { name: "Arial", status: "ok", source: null },
        { name: "Bremlin", status: "missing", source: null },
        { name: "Bricolage", status: "unmatched", source: "google" },
        { name: "Brich", status: "installed", source: "embedded" },
      ])
    ).toEqual(["Bremlin", "Bricolage"]);
  });

  it("traduz o andamento para a lista de tarefas", () => {
    const tm = (k: string, n?: Record<string, unknown>) => `${k}${n ? JSON.stringify(n) : ""}`;
    expect(progressDetail({ path: "a", phase: "fonts" }, tm)?.progress).toBe(10);
    expect(
      progressDetail({ path: "a", phase: "converting", converter: "PowerPoint" }, tm)?.detail
    ).toContain("PowerPoint");
    expect(progressDetail({ path: "a", phase: "done" }, tm)).toBeNull();
  });
});
