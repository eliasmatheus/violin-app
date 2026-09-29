import Telemetry from "@/helpers/Telemetry";
import { classifyNetworkError } from "@/helpers/Http";
import type { LibrasTranslationContext } from "@/types/Libras";

const MAX_BODY_BYTES = 2048;
const BODY_TIMEOUT_MS = 1000;
const MAX_MESSAGE_CHARS = 512;
let sequence = 0;

interface TranslationDiagnostic {
  startedAt: number;
  attributes: Record<string, unknown>;
}

const now = () => performance.now();

export function createLibrasOperationId(): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* ambientes sem Web Crypto conservam correlação por instância */
  }
  return `libras-${Date.now().toString(36)}-${++sequence}`;
}

/** O contexto do chamador tem campos fechados; o texto só acompanha uma falha. */
export function beginLibrasTranslationDiagnostic(
  text: string,
  context: LibrasTranslationContext = {}
): TranslationDiagnostic | null {
  try {
    if (!Telemetry.isEnabled()) return null;
    const requestId = createLibrasOperationId();
    const attributes: Record<string, unknown> = {
      diagnostic_schema_version: 1,
      source: "libras-translate",
      request_id: requestId,
      operation_id:
        typeof context.operationId === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(context.operationId)
          ? context.operationId
          : requestId,
      operation: [
        "direct",
        "live_music",
        "live_bible",
        "download_music",
        "download_bible",
      ].includes(context.operation || "")
        ? context.operation
        : "direct",
      part: ["text", "slide", "verse"].includes(context.part || "") ? context.part : "text",
      input_chars: text.length,
      input_bytes: new TextEncoder().encode(text).byteLength,
      input_lines: (text.match(/\r\n|[\r\n]/g)?.length || 0) + 1,
      input_contains_markup: /<[^>]+>/.test(text),
    };
    const numeric = {
      music_id: context.musicId,
      slide_index: context.slideIndex,
      bible_book_id: context.bibleBookId,
      bible_chapter: context.bibleChapter,
    };
    for (const [key, value] of Object.entries(numeric)) {
      if (Number.isSafeInteger(value) && Number(value) >= (key === "slide_index" ? 0 : 1))
        attributes[key] = value;
    }
    if (typeof context.bibleVersion === "string" && /^[\w .-]{1,40}$/.test(context.bibleVersion))
      attributes.bible_version = context.bibleVersion;
    if (Array.isArray(context.bibleVerses))
      attributes.bible_verses = context.bibleVerses
        .filter((verse) => Number.isSafeInteger(verse) && verse > 0)
        .slice(0, 50);
    return { startedAt: now(), attributes };
  } catch {
    return null;
  }
}

function sanitizeMessage(value: string): string {
  return (
    value
      // Cabeçalhos em texto podem ter scheme/valores múltiplos; mascare a linha inteira.
      .replace(
        /\b(authorization|cookie|set-cookie)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\r\n]+)/gi,
        "$1=[REDACTED]"
      )
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
      .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
      .replace(
        /\b(authorization|cookie|set-cookie|password|passwd|secret|client[-_]?secret|api[-_]?(?:key|token)|access[-_]?token|refresh[-_]?token|token)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi,
        "$1=[REDACTED]"
      )
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[REDACTED]")
      .replace(/\p{Cc}+/gu, " ")
      .slice(0, MAX_MESSAGE_CHARS)
      .trim()
  );
}

async function inputDetails(text: string): Promise<Record<string, unknown>> {
  let fingerprint: string;
  try {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    fingerprint = `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    // Fallback determinístico para Web Crypto indisponível; o prefixo distingue algoritmos.
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    fingerprint = `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  return {
    input_fingerprint: fingerprint,
    input_preview: sanitizeMessage(text),
    input_preview_truncated: text.length > MAX_MESSAGE_CHARS,
  };
}

function report(attributes: Record<string, unknown>): void {
  try {
    Telemetry.log("warn", "libras translation failed", attributes);
  } catch {
    /* diagnóstico não pode mudar o resultado da tradução */
  }
}

function contentType(response: Response): string {
  const mime =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "unknown";
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime) ? mime : "unknown";
}

function providerCorrelation(response: Response): Record<string, unknown> {
  const formats: Array<[string, RegExp]> = [
    ["x-request-id", /^[a-zA-Z0-9._-]{1,128}$/],
    ["request-id", /^[a-zA-Z0-9._-]{1,128}$/],
    ["traceparent", /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i],
    ["cf-ray", /^[0-9a-f]{16,32}(?:-[a-zA-Z]{3})?$/],
  ];
  for (const [header, pattern] of formats) {
    const value = response.headers.get(header);
    if (value && pattern.test(value))
      return {
        provider_request_id_available: true,
        provider_request_id: value,
        provider_request_id_header: header,
      };
  }
  return { provider_request_id_available: false };
}

async function responseError(response: Response): Promise<Record<string, unknown>> {
  const mime = contentType(response);
  if (!/json|^text\/plain$|^text\/html$/.test(mime))
    return { response_error_read: "unsupported_content_type" };
  if (!response.body) return { response_error_read: "empty" };
  const reader = response.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = async () => {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;
    while (bytes < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const allowed = Math.min(value.byteLength, MAX_BODY_BYTES - bytes);
      chunks.push(value.slice(0, allowed));
      bytes += allowed;
      if (bytes === MAX_BODY_BYTES) {
        truncated = true;
        break;
      }
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { text: new TextDecoder().decode(joined), truncated };
  };
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("diagnostic_body_timeout")), BODY_TIMEOUT_MS);
    });
    const { text, truncated } = await Promise.race([read(), timeout]);
    let message: unknown;
    if (mime.includes("json")) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const body = parsed as Record<string, unknown>;
          const error = body.error;
          message = typeof error === "string" ? error : (body.message ?? body.title);
          if (!message && error && typeof error === "object" && !Array.isArray(error))
            message = (error as Record<string, unknown>).message;
          if (!message && Array.isArray(error))
            message = error
              .slice(0, 3)
              .map((entry) =>
                entry && typeof entry === "object"
                  ? (entry as Record<string, unknown>).text
                  : undefined
              )
              .filter((entry) => typeof entry === "string")
              .join("; ");
        }
      } catch {
        /* JSON incompleto não autoriza enviar o corpo arbitrário */
      }
    } else if (mime === "text/html") {
      message = /<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1];
    } else {
      message = text;
    }
    return {
      response_error_read: text
        ? typeof message === "string" && message
          ? "ok"
          : "unrecognized"
        : "empty",
      response_body_truncated: truncated,
      ...(typeof message === "string" && message
        ? { provider_error: sanitizeMessage(message) }
        : {}),
    };
  } catch (error) {
    return {
      response_error_read:
        error instanceof Error && error.message === "diagnostic_body_timeout"
          ? "timeout"
          : "unreadable",
    };
  } finally {
    if (timer) clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

/** Leitura limitada em segundo plano: falha HTTP continua retornando null imediatamente. */
export function reportLibrasHttpFailure(
  diagnostic: TranslationDiagnostic | null,
  response: Response,
  text: string
): void {
  if (!diagnostic || !Telemetry.isEnabled()) return;
  const attributes = {
    ...diagnostic.attributes,
    duration_ms: Math.max(0, Math.round(now() - diagnostic.startedAt)),
    http_status: response.status,
    response_content_type: contentType(response),
    ...providerCorrelation(response),
    failure_kind:
      response.status >= 500
        ? "http_server"
        : response.status >= 400
          ? "http_client"
          : "http_other",
  };
  void Promise.all([responseError(response), inputDetails(text)])
    .then(([error, input]) => report({ ...attributes, ...error, ...input }))
    .catch(() => report({ ...attributes, response_error_read: "unreadable" }));
}

export function reportLibrasRequestFailure(
  diagnostic: TranslationDiagnostic | null,
  error: unknown,
  text: string,
  response?: Response,
  timedOut = false
): void {
  if (!diagnostic || !Telemetry.isEnabled()) return;
  const failure = error instanceof Error || error instanceof DOMException ? error : null;
  const attributes = {
    ...diagnostic.attributes,
    duration_ms: Math.max(0, Math.round(now() - diagnostic.startedAt)),
    failure_kind: response ? "response_body" : "transport",
    ...(response
      ? {
          http_status: response.status,
          response_content_type: contentType(response),
          ...providerCorrelation(response),
        }
      : {}),
    error_name: failure ? sanitizeMessage(failure.name).slice(0, 80) : "unknown",
    ...(response
      ? {}
      : {
          transport_kind:
            timedOut || failure?.name === "TimeoutError"
              ? "timeout"
              : failure?.name === "AbortError"
                ? "abort"
                : classifyNetworkError(error) === "network"
                  ? "network"
                  : "unknown",
        }),
    error_message: failure ? sanitizeMessage(failure.message) : "Unknown error",
  };
  void inputDetails(text)
    .then((input) => report({ ...attributes, ...input }))
    .catch(() => report(attributes));
}
