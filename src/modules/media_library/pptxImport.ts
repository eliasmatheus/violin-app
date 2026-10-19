/**
 * PowerPoint na Biblioteca de Mídia.
 *
 * O .pptx não é projetado direto: o processo main instala as fontes que faltam
 * e o próprio PowerPoint (ou o LibreOffice) gera um PDF fiel. Daqui para a
 * frente o item é um PDF comum — a projeção de arquivo já o leva para o telão
 * e para o retorno.
 *
 * Funções puras (sem Vue) para poderem ser testadas sozinhas.
 */

/** Extensões de apresentação aceitas pela biblioteca. */
export const PPT_EXT = ["pptx", "ppsx", "pptm", "ppt", "pps", "odp"];

/** Valor do `accept` do `<input type="file">` para apresentações. */
export const PPT_ACCEPT = PPT_EXT.map((e) => "." + e).join(",");

/** O nome de arquivo é uma apresentação? */
export function isPowerPointName(name: string | undefined | null): boolean {
  const ext = String(name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return !!ext && String(name).includes(".") && PPT_EXT.includes(ext);
}

/** Fontes que o arquivo pede e que continuam faltando depois da conversão. */
export function missingFonts(fonts: PptxFont[] | undefined): string[] {
  return (fonts || [])
    .filter((f) => f.status === "missing" || f.status === "unmatched")
    .map((f) => f.name);
}

/**
 * Valida a resposta do IPC antes de usar (fronteira).
 * Qualquer coisa fora do contrato vira falha com mensagem genérica.
 */
export function parseConvertResult(raw: unknown): PptxConvertResult {
  const r = raw as Partial<PptxConvertResult> | null;
  if (r && r.ok === true && typeof r.path === "string" && r.path.toLowerCase().endsWith(".pdf")) {
    return {
      ok: true,
      path: r.path,
      cached: !!r.cached,
      converter: typeof r.converter === "string" ? r.converter : "",
      fonts: Array.isArray(r.fonts)
        ? r.fonts.filter((f) => f && typeof f.name === "string" && typeof f.status === "string")
        : [],
      staleFonts: !!r.staleFonts,
    };
  }
  const fail = r as { code?: unknown; message?: unknown } | null;
  return {
    ok: false,
    code: typeof fail?.code === "string" ? fail.code : "convert_failed",
    message:
      typeof fail?.message === "string" && fail.message ? fail.message : "falha desconhecida",
  };
}

/** Texto curto do andamento, para a lista de tarefas em segundo plano. */
export function progressDetail(
  p: PptxProgress,
  tm: (_key: string, _named?: Record<string, unknown>) => string
): { detail: string; progress: number } | null {
  if (p.phase === "fonts") return { detail: tm("pptx.checking_fonts"), progress: 10 };
  if (p.phase === "font" && p.status === "searching")
    return { detail: tm("pptx.font_searching", { name: p.name }), progress: 25 };
  if (p.phase === "font" && p.status === "installed")
    return { detail: tm("pptx.font_installed", { name: p.name }), progress: 40 };
  if (p.phase === "converting")
    return { detail: tm("pptx.converting", { converter: p.converter || "" }), progress: 60 };
  return null;
}
