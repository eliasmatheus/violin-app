export interface CpuProfileFrame {
  function: string;
  source: string;
  line: number | null;
  column: number | null;
}
export interface CpuProfileSummaryLog {
  sample_count: number;
  sampled_duration_ms: number;
  idle_ms: number;
  gc_ms: number;
  program_ms: number;
  unattributed_ms: number;
  top_frames: (CpuProfileFrame & { sample_count: number; self_sample_ms: number })[];
  top_stacks: { sample_count: number; sampled_ms: number; frames: string[] }[];
}

const SUMMARY_KEYS = [
  "sample_count",
  "sampled_duration_ms",
  "idle_ms",
  "gc_ms",
  "program_ms",
  "unattributed_ms",
  "top_frames",
  "top_stacks",
];
const FRAME_KEYS = ["function", "source", "line", "column"];
const CONSTANT_SOURCES = new Set(["external", "unknown", "native"]);
const MAX_BYTES = 8192;

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function closed(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    object(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function numeric(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}
function count(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= max;
}
function ascii(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= max &&
    Array.from(value).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126)
  );
}
function sourceValid(value: unknown): value is string {
  if (typeof value === "string" && CONSTANT_SOURCES.has(value)) return true;
  return (
    ascii(value, 160) &&
    /^(?:electron|src|assets)\/[a-z\d_./-]+$/i.test(value) &&
    value.split("/").every((segment) => segment && segment !== "." && segment !== "..")
  );
}
function readFrame(value: unknown): CpuProfileFrame | null {
  if (
    !closed(value, FRAME_KEYS) ||
    !ascii(value.function, 120) ||
    /\beval(?:\s|$|@|\()/i.test(value.function) ||
    !sourceValid(value.source)
  )
    return null;
  if (CONSTANT_SOURCES.has(value.source)) {
    if (value.function !== value.source || value.line !== null || value.column !== null)
      return null;
  } else if (
    !(value.line === null || count(value.line, Number.MAX_SAFE_INTEGER)) ||
    !(value.column === null || count(value.column, Number.MAX_SAFE_INTEGER))
  )
    return null;
  return {
    function: value.function,
    source: value.source,
    line: value.line as number | null,
    column: value.column as number | null,
  };
}
function logFrame(frame: CpuProfileFrame): string {
  const prefix = `${frame.function} (`;
  const suffix = `:${frame.line ?? "?"}:${frame.column ?? "?"})`;
  const available = 256 - prefix.length - suffix.length;
  const source =
    frame.source.length > available ? `${frame.source.slice(0, available - 3)}...` : frame.source;
  return `${prefix}${source}${suffix}`;
}

/** Revalidate the Node summary boundary and flatten caller frames for the telemetry depth limit. */
export function cpuProfileLogSummary(value: unknown): CpuProfileSummaryLog | null {
  try {
    if (
      !closed(value, SUMMARY_KEYS) ||
      !count(value.sample_count, 10000) ||
      !numeric(value.sampled_duration_ms) ||
      value.sampled_duration_ms <= 0
    )
      return null;
    for (const key of ["idle_ms", "gc_ms", "program_ms", "unattributed_ms"]) {
      if (!numeric(value[key]) || value[key] > value.sampled_duration_ms) return null;
    }
    const idleMs = value.idle_ms as number,
      gcMs = value.gc_ms as number,
      programMs = value.program_ms as number,
      unattributedMs = value.unattributed_ms as number;
    if (idleMs + gcMs + programMs + unattributedMs > value.sampled_duration_ms + 0.001) return null;
    if (
      !Array.isArray(value.top_frames) ||
      value.top_frames.length > 8 ||
      !Array.isArray(value.top_stacks) ||
      value.top_stacks.length > 5
    )
      return null;
    const topFrames: CpuProfileSummaryLog["top_frames"] = [];
    for (const frame of value.top_frames) {
      if (
        !closed(frame, [...FRAME_KEYS, "sample_count", "self_sample_ms"]) ||
        !count(frame.sample_count, value.sample_count) ||
        !numeric(frame.self_sample_ms) ||
        frame.self_sample_ms <= 0 ||
        frame.self_sample_ms > value.sampled_duration_ms
      )
        return null;
      const safe = readFrame(Object.fromEntries(FRAME_KEYS.map((key) => [key, frame[key]])));
      if (!safe) return null;
      topFrames.push({
        ...safe,
        sample_count: frame.sample_count,
        self_sample_ms: frame.self_sample_ms,
      });
    }
    const topStacks: CpuProfileSummaryLog["top_stacks"] = [];
    for (const stack of value.top_stacks) {
      if (
        !closed(stack, ["sample_count", "sampled_ms", "frames"]) ||
        !count(stack.sample_count, value.sample_count) ||
        !numeric(stack.sampled_ms) ||
        stack.sampled_ms <= 0 ||
        stack.sampled_ms > value.sampled_duration_ms ||
        !Array.isArray(stack.frames) ||
        stack.frames.length < 1 ||
        stack.frames.length > 6
      )
        return null;
      const frames = stack.frames.map(readFrame);
      if (frames.some((frame) => !frame)) return null;
      topStacks.push({
        sample_count: stack.sample_count,
        sampled_ms: stack.sampled_ms,
        frames: frames.map((frame) => logFrame(frame!)),
      });
    }
    const hotDuration = value.sampled_duration_ms - idleMs - gcMs - programMs;
    if (
      topFrames.reduce((sum, frame) => sum + frame.sample_count, 0) > value.sample_count ||
      topStacks.reduce((sum, stack) => sum + stack.sample_count, 0) > value.sample_count ||
      topFrames.reduce((sum, frame) => sum + frame.self_sample_ms, 0) > hotDuration + 0.001 ||
      topStacks.reduce((sum, stack) => sum + stack.sampled_ms, 0) > hotDuration + 0.001
    )
      return null;
    const result: CpuProfileSummaryLog = {
      sample_count: value.sample_count,
      sampled_duration_ms: value.sampled_duration_ms,
      idle_ms: idleMs,
      gc_ms: gcMs,
      program_ms: programMs,
      unattributed_ms: unattributedMs,
      top_frames: topFrames,
      top_stacks: topStacks,
    };
    // Every retained label is ASCII; JSON length equals its UTF-8 byte length.
    if (JSON.stringify(value).length > MAX_BYTES || JSON.stringify(result).length > MAX_BYTES)
      return null;
    return result;
  } catch {
    return null;
  }
}
