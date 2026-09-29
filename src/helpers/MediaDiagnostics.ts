import Telemetry from "@/helpers/Telemetry";

/** Bounded media diagnostics. Never retain full paths, URLs, queries or blob bytes. */
export function mediaSourceDetails(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return { source_present: false };
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  const source: Record<string, unknown> = {
    source_present: true,
    source_scheme: ["http", "https", "louvorja", "file", "blob", "data"].includes(scheme || "")
      ? scheme
      : "other",
  };
  // Opaque object/data sources are intentionally not parsed as filenames.
  if (scheme === "blob" || scheme === "data") return source;
  if (value.length > 8192) return { ...source, source_too_long: true };
  try {
    const parsed = new URL(value, "https://relative.invalid/");
    const extension = /\.([a-z\d]{1,10})$/i.exec(parsed.pathname)?.[1]?.toLowerCase();
    if (extension) source.file_ext = extension;
    // Basename is enough to identify the original file without retaining its directory.
    const basename = parsed.pathname.split("/").pop();
    if (basename && extension) {
      const decodedName = decodeURIComponent(basename).split(/[\\/]/).pop() || "";
      source.file_basename = Array.from(decodedName)
        .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
        .join("")
        .slice(0, 128);
    }
    if (scheme === "louvorja") {
      const host = parsed.hostname;
      source.source_transport = ["local", "files", "onlinevideo", "onlinestream"].includes(host)
        ? host
        : "desktop_other";
    } else if (scheme === "http" || scheme === "https") {
      source.source_transport = "network";
    } else if (scheme === "file" || !scheme) {
      source.source_transport = "local";
    }
  } catch {
    /* malformed sources have no inferred format */
  }
  return source;
}

export function mediaDiagnosticMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .slice(0, 500)
    .replace(/(?:https?|file|louvorja|blob|data):[^\s"'<>]*/gi, "[source]")
    .replace(/\b[a-z]:[\\/][^\s"'<>]*/gi, "[path]")
    .replace(/(^|[\s("'=])\/[^\s"'<>]*/g, "$1[path]")
    .slice(0, 240);
}

export function mediaMimeType(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const mime = value.split(";", 1)[0].trim().toLowerCase();
  return /^[a-z\d!#$&^_.+-]{1,64}\/[a-z\d!#$&^_.+-]{1,64}$/.test(mime) ? mime : "unknown";
}

/** Metadata from bytes already loaded by the existing flow, without probing codecs. */
export function mediaBlobDetails(
  blob: Blob,
  responseContentType?: unknown
): Record<string, unknown> {
  return {
    blob_mime: mediaMimeType(blob.type),
    blob_bytes: blob.size,
    ...(responseContentType !== undefined
      ? { response_content_type: mediaMimeType(responseContentType) }
      : {}),
    codec: "unknown",
  };
}

export function mediaLibraryDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const ref = value as Record<string, unknown>;
  const result: Record<string, unknown> = { library_ref_present: true };
  for (const key of ["id", "table"] as const) {
    if (typeof ref[key] === "string" && /^[a-z\d_.:-]{1,128}$/i.test(ref[key]))
      result[`library_${key}`] = ref[key];
  }
  return result;
}

/** A telemetry provider failure must never change media control flow. */
export function mediaDiagnosticLog(
  level: "debug" | "warn" | "error",
  message: string,
  properties: Record<string, unknown>
): void {
  try {
    Telemetry.log(level, message, properties);
  } catch {
    /* diagnostic only */
  }
}

export function mediaDiagnosticVideoId(url: string): string | null {
  return /\/embed\/([a-z\d_-]{11})(?:[/?&#]|$)/i.exec(url)?.[1] || null;
}

function ranges(value: TimeRanges): number[][] {
  const result: number[][] = [];
  try {
    for (let index = 0; index < Math.min(value.length, 3); index++) {
      const start = value.start(index),
        end = value.end(index);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        result.push([Math.round(start * 1000) / 1000, Math.round(end * 1000) / 1000]);
      }
    }
  } catch {
    /* some ranges change while Chromium is loading a source */
  }
  return result;
}

/** Capture once at a failure/phase boundary, never per playback tick. */
export function mediaElementDetails(
  el: HTMLMediaElement | null | undefined
): Record<string, unknown> {
  if (!el) return { media_element_present: false };
  try {
    const actualSource = el.currentSrc || el.getAttribute("src") || "";
    return {
      media_element_present: true,
      media_element_kind: el.tagName.toLowerCase(),
      codec: "unknown",
      ...mediaSourceDetails(actualSource),
      current_src_present: !!el.currentSrc,
      ready_state: el.readyState,
      network_state: el.networkState,
      current_time: Number.isFinite(el.currentTime)
        ? Math.round(el.currentTime * 1000) / 1000
        : null,
      duration: Number.isFinite(el.duration) ? Math.round(el.duration * 1000) / 1000 : null,
      paused: el.paused,
      ended: el.ended,
      seeking: el.seeking,
      muted: el.muted,
      playback_rate: Number.isFinite(el.playbackRate) ? el.playbackRate : null,
      buffered_ranges: ranges(el.buffered),
      seekable_ranges: ranges(el.seekable),
      media_error_code: el.error?.code,
      media_error_message: mediaDiagnosticMessage(el.error?.message),
      ...(el.tagName.toLowerCase() === "video"
        ? {
            video_width: (el as HTMLVideoElement).videoWidth,
            video_height: (el as HTMLVideoElement).videoHeight,
          }
        : {}),
    };
  } catch {
    return { media_element_present: true, diagnostic_unavailable: true };
  }
}

/** Known format fields from the stream IPC response; arbitrary metadata is discarded. */
export function mediaFormatDetails(value: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = { vcodec: "unknown", acodec: "unknown" };
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const data = value as Record<string, unknown>;
  for (const key of ["vcodec", "acodec", "ext"] as const) {
    const field = data[key];
    if (typeof field === "string" && /^[a-z\d._-]{1,48}$/i.test(field)) result[key] = field;
  }
  for (const key of ["height", "width", "size"] as const) {
    const field = data[key];
    if (typeof field === "number" && Number.isSafeInteger(field) && field >= 0) result[key] = field;
  }
  return result;
}
