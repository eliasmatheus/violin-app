"use strict";

const { randomUUID } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const path = require("node:path");
const { Worker } = require("node:worker_threads");
const { sanitizeCpuProfileSummary } = require("./cpuProfileSummary.js");

const CAPTURE_MS = 20_000;
const SAMPLING_INTERVAL_US = 20_000;
const COOLDOWN_MS = 30 * 60_000;
const MAX_CAPTURES = 3;
const MAX_WINDOW_MS = 35_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const REASONS = new Set(["invalid_options", "backend_unavailable", "start_timeout", "stop_timeout", "capture_failed", "summary_failed", "no_samples"]);
const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const label = (value) => typeof value === "string" ? value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 64) : "unknown";

function createMainBackend(options, onMessage) {
  const worker = new Worker(path.join(__dirname, "cpuProfileWorker.js"), { workerData: {
    duration_ms: options.durationMs,
    sampling_interval_us: options.samplingIntervalUs,
    app_root: options.appRoot,
  } });
  worker.unref();
  let cancelled = false;
  let terminal = false;
  worker.on("message", (message) => {
    if (cancelled) return;
    if (message?.type === "completed" || message?.type === "unavailable") terminal = true;
    onMessage(message);
  });
  worker.on("error", () => {
    if (!cancelled && !terminal) {
      terminal = true;
      onMessage({ type: "unavailable", reason: "backend_unavailable" });
    }
  });
  worker.on("exit", () => {
    if (!cancelled && !terminal) onMessage({ type: "unavailable", reason: "capture_failed" });
  });
  return { cancel() {
    cancelled = true;
    try { worker.postMessage({ type: "cancel" }); } catch { /* Worker already exited. */ }
    void worker.terminate().catch(() => {});
  } };
}

/**
 * No worker, debugger or profiler is started on healthy application paths.
 * A critical incident opens one short follow-up window for subsequent work;
 * its samples never claim to reconstruct the incident that triggered it.
 */
function createCpuProfileCapture(options = {}) {
  const enabled = options.enabled || (() => false);
  const now = options.now || (() => performance.now());
  const wallNow = options.wallNow || Date.now;
  const createId = options.createId || randomUUID;
  const onResult = options.onResult || (() => {});
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  const mainBackend = options.mainBackend || createMainBackend;
  let active = null;
  let captures = 0;
  let lastCaptureAt = -Infinity;

  function isEnabled() {
    try { return enabled() === true; } catch { return false; }
  }

  function cancel() {
    const state = active;
    if (!state) return;
    active = null;
    clearTimer(state.watchdog);
    try { state.backend?.cancel(); } catch { /* Diagnostics are optional. */ }
  }

  function finish(state, result) {
    if (active !== state) return;
    const permitted = isEnabled();
    cancel();
    if (!permitted) return;
    const summary = result.type === "completed" ? sanitizeCpuProfileSummary(result.summary) : null;
    const completed = summary && summary.sample_count > 0;
    const reason = result.type === "unavailable" && REASONS.has(result.reason)
      ? result.reason : summary && !summary.sample_count ? "no_samples" : "summary_failed";
    const boundsValid = state.phase === "recording" && result.started_at_ms === state.startedAt &&
      finite(result.started_at_ms) && finite(result.ended_at_ms) &&
      result.started_at_ms >= state.requestedAt && result.ended_at_ms >= result.started_at_ms &&
      result.ended_at_ms <= state.requestedAt + MAX_WINDOW_MS && result.ended_at_ms <= now();
    const context = {
      diagnostic_schema_version: 1,
      incident_type: "cpu_profile_window",
      incident_id: createId(),
      incident_status: "detected",
      severity: "info",
      observed_at: new Date(wallNow()).toISOString(),
      window_role: "main",
      feature: state.feature,
      app_instance_id: state.appInstanceId,
      cpu_profile_id: state.id,
      cpu_profile_trigger_incident_id: state.trigger,
      cpu_profile_target: "main",
      cpu_profile_relation: "followup_window",
      cpu_profile_timing_basis: "sampled_elapsed_time",
      cpu_profile_status: completed && boundsValid ? "completed" : "unavailable",
      cpu_profile_reason: completed && boundsValid ? undefined : reason,
      cpu_profile_sampling_interval_us: SAMPLING_INTERVAL_US,
      cpu_profile_requested_duration_ms: CAPTURE_MS,
      cpu_profile_requested_at_ms: state.requestedAt,
      cpu_profile_activation_ms: state.activationMs,
      cpu_profile_started_at_ms: boundsValid ? result.started_at_ms : undefined,
      cpu_profile_ended_at_ms: boundsValid ? result.ended_at_ms : undefined,
      cpu_profile_duration_ms: boundsValid ? Math.round(result.ended_at_ms - result.started_at_ms) : undefined,
      cpu_profile_observed_incident_ids: state.incidents,
      cpu_profile_observations: state.observations,
      cpu_profile_summary: completed && boundsValid ? summary : undefined,
    };
    try { onResult(context); } catch { /* Do not interrupt the app for a failed log. */ }
  }

  function onMessage(state, result) {
    if (active !== state || !result || typeof result !== "object") return;
    if (!isEnabled()) { cancel(); return; }
    if (result.type === "started" && state.phase === "scheduled" && finite(result.started_at_ms) &&
      finite(result.activation_ms) && result.activation_ms <= MAX_WINDOW_MS &&
      result.started_at_ms >= state.requestedAt && result.started_at_ms <= state.requestedAt + MAX_WINDOW_MS &&
      result.started_at_ms <= now()) {
      state.startedAt = result.started_at_ms;
      state.activationMs = Math.round(result.activation_ms);
      state.phase = "recording";
    } else if (result.type === "completed" || result.type === "unavailable") {
      finish(state, result);
    }
  }

  function handleIncident(incident) {
    try {
      if (!isEnabled()) { cancel(); return {}; }
      if (!incident || !UUID.test(incident.incident_id) || incident.incident_status === "recovered" ||
        incident.incident_type !== "main_event_loop_stall" ||
        !finite(incident.duration_ms ?? incident.main_loop_max_ms) ||
        (incident.duration_ms ?? incident.main_loop_max_ms) < 1000) return {};
      if (active) {
        if (active.phase === "recording" && incident.incident_id !== active.trigger && active.incidents.length < 4 &&
          !active.incidents.includes(incident.incident_id)) active.incidents.push(incident.incident_id);
        return { cpu_profile_id: active.id, cpu_profile_status: active.phase,
          cpu_profile_target: "main", cpu_profile_relation: "followup_window" };
      }
      const requestedAt = now();
      if (!finite(requestedAt) || captures >= MAX_CAPTURES || requestedAt - lastCaptureAt < COOLDOWN_MS) return {};
      const state = { id: createId(), trigger: incident.incident_id,
        phase: "scheduled", requestedAt, startedAt: null, activationMs: undefined,
        feature: label(incident.feature),
        appInstanceId: UUID.test(incident.app_instance_id) ? incident.app_instance_id : undefined,
        incidents: [], observations: [], backend: null, watchdog: null };
      captures++;
      lastCaptureAt = requestedAt;
      active = state;
      state.watchdog = setTimer(() => {
        finish(state, { type: "unavailable", reason: "capture_failed" });
      }, MAX_WINDOW_MS);
      state.watchdog?.unref?.();
      const configuration = { appRoot: options.appRoot, durationMs: CAPTURE_MS,
        samplingIntervalUs: SAMPLING_INTERVAL_US };
      // The backend invokes callbacks asynchronously. Defensive state checks
      // also support synchronous failures in adapters and tests.
      const backend = mainBackend(configuration, (message) => onMessage(state, message));
      state.backend = backend;
      if (active !== state) { try { backend?.cancel(); } catch { /* noop */ } return {}; }
      return { cpu_profile_id: state.id, cpu_profile_status: state.phase,
        cpu_profile_target: "main", cpu_profile_relation: "followup_window" };
    } catch {
      cancel();
      return {};
    }
  }

  function observeEventLoopSample(sample) {
    try {
      if (!isEnabled()) { cancel(); return; }
      if (!active || active.phase !== "recording" ||
        active.observations.length >= 4 || !finite(sample?.main_loop_max_ms) ||
        sample.main_loop_max_ms < 1000 || !finite(sample.main_sample_started_at_ms) ||
        !finite(sample.main_sample_ended_at_ms) || sample.main_sample_ended_at_ms < sample.main_sample_started_at_ms ||
        sample.main_sample_ended_at_ms <= active.startedAt) return;
      // These are histogram windows, not timestamps for an individual task.
      // Keep their bounds so a reviewer can assess partial capture coverage.
      active.observations.push({ sample_started_at_ms: sample.main_sample_started_at_ms,
        sample_ended_at_ms: sample.main_sample_ended_at_ms, max_delay_ms: sample.main_loop_max_ms,
        ...(finite(sample.main_cpu_percent) ? { main_cpu_percent: sample.main_cpu_percent } : {}),
        ...(finite(sample.sample_window_ms) ? { sample_window_ms: sample.sample_window_ms } : {}),
      });
    } catch { /* Diagnostics never interrupt the monitor. */ }
  }

  return { handleIncident, observeEventLoopSample, cancel };
}

module.exports = { createCpuProfileCapture, CAPTURE_MS, SAMPLING_INTERVAL_US, COOLDOWN_MS, MAX_CAPTURES };
