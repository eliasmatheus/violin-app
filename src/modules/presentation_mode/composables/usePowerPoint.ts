import Platform from "@/helpers/Platform";
import $snackbar from "@/helpers/Snackbar";
import Telemetry from "@/helpers/Telemetry";
import { i18nAtual } from "@/i18n";

/**
 * PowerPoint no culto: o PowerPoint instalado no computador converte o arquivo
 * em PDF (no main, com cache), e o PDF passa com o passador como qualquer
 * outro. Pedir a conversão antes — ao ver o arquivo no palco — deixa o envio
 * instantâneo na hora do culto.
 */

const PPT_EXT = ["ppt", "pptx", "pps", "ppsx", "pptm", "ppsm"];

/**
 * Ligado: a conversão agora é a mesma da Biblioteca de Mídia (`main/pptx`):
 * fontes instaladas antes, cada slide desenhado como imagem pelo próprio
 * PowerPoint (ou pelo LibreOffice), então os textos saem como no original.
 */
export const POWERPOINT_ENABLED = true;
/** Só avisa "convertendo" se demorar: a conversão em cache volta na hora. */
const NOTICE_AFTER_MS = 400;

export function isPowerPoint(path: string): boolean {
  return PPT_EXT.includes(path.split(".").pop()?.toLowerCase() ?? "");
}

function tm(key: string, params?: Record<string, unknown>): string {
  const t = i18nAtual()?.global?.t as ((k: string, p?: unknown) => unknown) | undefined;
  const full = `modules.presentation_mode.pptx.${key}`;
  return t ? String(t(full, params)) : full;
}

/**
 * Converte em segundo plano, sem avisos: o resultado fica no cache do main.
 * Com um item do programa, os arquivos filhos (de um momento) também.
 */
export function preparePowerPoint(
  path: string | null,
  item?: { children?: { path?: string }[] } | null
): void {
  if (!POWERPOINT_ENABLED) return;
  for (const p of [path, ...(item?.children ?? []).map((c) => c.path)])
    if (p && isPowerPoint(p)) void Platform.convertPresentation(p).catch(() => null);
}

/** O PDF do PowerPoint, ou null (o operador já foi avisado do porquê). */
export async function powerPointAsPdf(path: string, name: string): Promise<string | null> {
  if (!POWERPOINT_ENABLED) {
    Telemetry.track("presentation_pptx_failed", { error: "disabled" });
    $snackbar.warning(tm("disabled", { name }), { timeout: 8000 });
    return null;
  }
  const notice = setTimeout(() => $snackbar.info(tm("converting", { name })), NOTICE_AFTER_MS);
  const res = await Platform.convertPresentation(path).catch(() => null);
  clearTimeout(notice);
  if (res?.ok) {
    // Fonte que não deu para instalar sozinha: o slide sai, mas com outra letra.
    const faltam = (res as { missingFonts?: unknown }).missingFonts;
    if (Array.isArray(faltam) && faltam.length) {
      $snackbar.warning(tm("missing_fonts", { name, fonts: faltam.join(", ") }), { timeout: 10000 });
    }
    return res.pdf;
  }
  const error = res?.error ?? "exception";
  Telemetry.track("presentation_pptx_failed", { error });
  $snackbar.error(tm(error === "unsupported" ? "unsupported" : "failed", { name }), {
    timeout: 8000,
  });
  return null;
}
