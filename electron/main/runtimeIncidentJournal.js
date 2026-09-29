"use strict";

const fs = require("fs-extra");
const { createHash } = require("node:crypto");
const { atomicWriteJson } = require("./asyncJsonWriteQueue.js");
const { sanitizeCpuProfileSummary } = require("./cpuProfileSummary.js");

const MAX_RECORDS = 20;
const MAX_ENTRY_BYTES = 16 * 1024;
const MAX_FILE_BYTES = MAX_RECORDS * MAX_ENTRY_BYTES + 1024;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH_ID = /^sha256:[a-f0-9]{64}$/;
const ENUMS = {
  incident_type: ["main_event_loop_stall", "renderer_unresponsive", "render_process_gone", "child_process_gone", "renderer_long_task", "renderer_timer_stall", "online_video_progressive_failure", "cpu_profile_window"],
  incident_status: ["detected", "recovered"],
  severity: ["info", "warn", "error", "fatal"],
  window_role: ["main", "auxiliary", "unknown"],
  renderer_visibility: ["visible", "hidden", "prerender", "unknown"],
  child_process_type: ["GPU", "Utility", "Renderer", "Zygote", "Sandbox helper", "Pepper Plugin", "Pepper Plugin Broker", "unknown"],
  reason: ["clean-exit", "abnormal-exit", "killed", "crashed", "oom", "launch-failed", "integrity-failure", "memory-eviction", "unknown"],
  download_worker_phase: ["starting", "spawned", "ready", "downloading", "paused", "cancelling", "finishing", "exited"],
  download_worker_termination_phase: ["starting", "spawned", "ready", "downloading", "paused", "cancelling", "finishing", "exited"],
  download_worker_termination_intent: ["none", "completed", "cancelled", "failed"],
  download_worker_termination_reason: ["queue_done", "queue_cancelled", "cancel_deadline", "download_worker_exited", "download_worker_error", "download_worker_start_timeout", "download_worker_spawn_failed", "download_worker_disconnected", "download_worker_failed", "download_worker_invalid_result"],
  download_worker_kill_result: ["not_requested", "pending", "accepted", "rejected", "threw", "unknown"],
  main_operation_coverage: ["instrumented_window_calls"],
  cpu_profile_target: ["main", "renderer"],
  cpu_profile_relation: ["followup_window"],
  cpu_profile_timing_basis: ["sampled_elapsed_time"],
  cpu_profile_status: ["scheduled", "recording", "completed", "unavailable"],
  cpu_profile_reason: ["invalid_options", "backend_unavailable", "start_timeout", "stop_timeout", "capture_failed", "summary_failed", "no_samples"],
};
const NUMBERS = [
  "diagnostic_schema_version", "main_pid", "main_uptime_ms", "web_contents_id",
  "renderer_last_seen_ms_ago", "presentation_revision", "main_memory_rss_mb",
  "main_heap_used_mb", "window_count", "duration_ms", "exit_code",
  "main_loop_mean_ms", "main_loop_p95_ms", "main_loop_p99_ms", "main_loop_max_ms",
  "main_cpu_percent", "sample_window_ms", "critical_budget_ms",
  "main_sample_started_at_ms", "main_sample_ended_at_ms",
  "renderer_long_task_count", "renderer_long_task_warn_count", "renderer_long_task_critical_count",
  "renderer_long_task_total_ms", "renderer_long_task_max_ms", "online_video_active_count",
  "online_video_foreground_running", "online_video_background_running",
  "online_video_foreground_queued", "online_video_background_queued",
  "download_worker_pid", "download_worker_duration_ms", "download_worker_exit_code",
  "cpu_profile_sampling_interval_us", "cpu_profile_requested_duration_ms", "cpu_profile_requested_at_ms",
  "cpu_profile_activation_ms", "cpu_profile_started_at_ms", "cpu_profile_ended_at_ms", "cpu_profile_duration_ms",
];
const BOOLEANS = ["download_active", "presentation_active", "http_server_running", "online_video_streaming", "download_worker_exit_observed"];
const STREAM_FAILURE_ENUMS = {
  kind: ["age", "bot", "disk", "forbidden", "format", "geo", "live", "network", "private", "tool", "unavailable", "unknown"],
  track: ["video", "audio", "unknown"],
  phase: ["opening", "downloading", "finalizing"],
  elapsed_bucket: ["lt_10s", "10s_1m", "1m_5m", "gte_5m", "unknown"],
  age_bucket: ["lt_10s", "10s_1m", "1m_5m", "gte_5m", "unknown"],
};

function safeStreamFailure(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const safe = {};
  for (const [key, allowed] of Object.entries(STREAM_FAILURE_ENUMS)) {
    if (!allowed.includes(value[key])) return null;
    safe[key] = value[key];
  }
  return safe;
}

// Keep UUID correlation; opaque non-UUID identifiers are hashed rather than
// retaining a possible title/path that arrived in an identifier field.
function safeId(value) {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  if (value === "unknown") return value;
  if (UUID.test(value) || HASH_ID.test(value)) return value;
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** Closed schema: no route, title, URL, stack, process name or free text. */
function sanitizeIncident(payload, now) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const id = safeId(payload.incident_id);
  if (!id || !ENUMS.incident_type.includes(payload.incident_type)) return null;
  const observedAt = typeof payload.observed_at === "string" && payload.observed_at.length <= 40
    ? Date.parse(payload.observed_at) : NaN;
  if (!Number.isFinite(observedAt) || observedAt < now - TTL_MS || observedAt > now + 60_000) return null;
  const record = {
    incident_id: id,
    app_instance_id: safeId(payload.app_instance_id) || "unknown",
    observed_at: new Date(observedAt).toISOString(),
    incident_status: "detected",
  };
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(payload[key])) record[key] = payload[key];
  }
  const playbackId = safeId(payload.playback_id);
  if (playbackId) record.playback_id = playbackId;
  for (const key of ["download_worker_id", "download_job_id", "cpu_profile_id", "cpu_profile_trigger_incident_id"]) {
    const value = safeId(payload[key]);
    if (value) record[key] = value;
  }
  for (const key of NUMBERS) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      record[key] = Math.max(key.endsWith("exit_code") ? -2147483648 : 0, Math.min(value, Number.MAX_SAFE_INTEGER));
    }
  }
  for (const key of BOOLEANS) {
    if (typeof payload[key] === "boolean") record[key] = payload[key];
  }
  if (Array.isArray(payload.cpu_profile_observed_incident_ids)) {
    record.cpu_profile_observed_incident_ids = payload.cpu_profile_observed_incident_ids.slice(0, 4).map(safeId).filter(Boolean);
  }
  if (Array.isArray(payload.cpu_profile_observations)) {
    record.cpu_profile_observations = payload.cpu_profile_observations.slice(0, 4).filter((item) =>
      item && ["sample_started_at_ms", "sample_ended_at_ms", "max_delay_ms"].every((key) =>
        typeof item[key] === "number" && Number.isFinite(item[key]) && item[key] >= 0) &&
      item.sample_ended_at_ms >= item.sample_started_at_ms
    ).map((item) => ({ sample_started_at_ms: item.sample_started_at_ms,
      sample_ended_at_ms: item.sample_ended_at_ms, max_delay_ms: item.max_delay_ms,
      ...Object.fromEntries(["main_cpu_percent", "sample_window_ms"].filter((key) =>
        typeof item[key] === "number" && Number.isFinite(item[key]) && item[key] >= 0 &&
        item[key] <= Number.MAX_SAFE_INTEGER).map((key) => [key, item[key]])),
    }));
  }
  if (payload.cpu_profile_summary !== undefined) {
    const summary = sanitizeCpuProfileSummary(payload.cpu_profile_summary);
    if (summary) record.cpu_profile_summary = summary;
  }
  if (Array.isArray(payload.main_synchronous_operations)) {
    const operations = ["window.open", "window.construct", "window.show", "window.position", "window.fullscreen", "main_window.construct"];
    record.main_synchronous_operations = payload.main_synchronous_operations.slice(0, 8).filter((item) =>
      item && operations.includes(item.operation) && ["completed", "threw"].includes(item.status)
    ).map((item) => {
      const safe = { operation: item.operation, status: item.status, timing_basis: "synchronous_call" };
      for (const key of ["started_at_ms", "ended_at_ms", "duration_ms", "cpu_user_ms", "cpu_system_ms", "sample_overlap_ms"]) {
        if (typeof item[key] === "number" && Number.isFinite(item[key]) && item[key] >= 0) safe[key] = Math.min(item[key], Number.MAX_SAFE_INTEGER);
      }
      return safe;
    });
  }
  if (record.incident_type === "online_video_progressive_failure") {
    const failure = safeStreamFailure(payload.last_stream_failure);
    if (!failure) return null;
    record.last_stream_failure = failure;
  }
  return Buffer.byteLength(JSON.stringify(record), "utf8") <= MAX_ENTRY_BYTES ? record : null;
}

function recordKey(record) {
  return `${record.app_instance_id}|${record.incident_id}|${record.incident_status}`;
}

/**
 * Local fallback only: append resolution confirms an atomic file replacement,
 * never PostHog ingestion. No background timer or writes on read/flush.
 * Caller owns consent gating and may clear() when telemetry is disabled.
 * A process killed before the asynchronous write finishes can lose that write.
 */
function createRuntimeIncidentJournal({ file, io = fs, now = Date.now }) {
  const resolveFile = typeof file === "function" ? file : () => file;
  let records = null;
  let tail = Promise.resolve();
  let lastWriteError = null;

  function serialize(operation) {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  }

  function prune(items) {
    const unique = new Map();
    for (const item of items.slice(-MAX_RECORDS)) {
      const record = sanitizeIncident(item, now());
      if (record) unique.set(recordKey(record), record);
    }
    return [...unique.values()].slice(-MAX_RECORDS);
  }

  async function load() {
    if (records !== null) return;
    const currentFile = resolveFile();
    for (const candidate of [currentFile, `${currentFile}.bak`]) {
      try {
        const stat = await io.stat(candidate);
        if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
        const raw = await io.readFile(candidate, "utf8");
        if (Buffer.byteLength(raw, "utf8") > MAX_FILE_BYTES) continue;
        const data = JSON.parse(raw);
        if (data?.version !== 1 || !Array.isArray(data.records)) continue;
        records = prune(data.records);
        return;
      } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      }
    }
    records = [];
  }

  async function persist(next) {
    const contents = JSON.stringify({ version: 1, records: next });
    if (Buffer.byteLength(contents, "utf8") > MAX_FILE_BYTES) throw new Error("Incident journal exceeds byte limit");
    try {
      await atomicWriteJson({ io, file: resolveFile(), contents });
      records = next;
      lastWriteError = null;
    } catch (error) {
      lastWriteError = error;
      throw error;
    }
  }

  function append(payload) {
    // Snapshot only the bounded schema before callers can mutate their object.
    const record = sanitizeIncident(payload, now());
    if (!record) return Promise.resolve({ ok: false, reason: "invalid_or_expired" });
    return serialize(async () => {
      await load();
      const current = prune(records);
      const key = recordKey(record);
      const existing = current.find((item) => recordKey(item) === key);
      if (existing && JSON.stringify(existing) === JSON.stringify(record)) return { ok: true, duplicate: true };
      const next = [...current.filter((item) => recordKey(item) !== key), record].slice(-MAX_RECORDS);
      await persist(next);
      return { ok: true };
    });
  }

  function read() {
    return serialize(async () => {
      await load();
      return prune(records).map((record) => ({ ...record }));
    });
  }

  function clear() {
    return serialize(async () => {
      // Remove recoverable remnants first so a confirmed clear cannot restore
      // old data from .bak after a later restart.
      const currentFile = resolveFile();
      await io.remove(`${currentFile}.bak`);
      await io.remove(`${currentFile}.tmp`);
      await io.remove(currentFile);
      records = [];
      lastWriteError = null;
    });
  }

  function flush() {
    return serialize(() => {
      if (lastWriteError) throw lastWriteError;
      return { ok: true };
    });
  }

  return { append, read, clear, flush };
}

module.exports = { createRuntimeIncidentJournal, sanitizeIncident, MAX_RECORDS, MAX_ENTRY_BYTES, MAX_FILE_BYTES, TTL_MS };
