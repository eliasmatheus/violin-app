"use strict";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PHASES = new Set(["starting", "spawned", "ready", "downloading", "paused", "cancelling", "finishing", "exited"]);
const INTENTS = new Set(["none", "completed", "cancelled", "failed"]);
const KILL_RESULTS = new Set(["not_requested", "pending", "accepted", "rejected", "threw", "unknown"]);
const REASONS = new Set(["queue_done", "queue_cancelled", "cancel_deadline", "download_worker_exited",
  "download_worker_error", "download_worker_start_timeout", "download_worker_spawn_failed",
  "download_worker_disconnected", "download_worker_failed", "download_worker_invalid_result"]);
const MAX_WORKERS = 32;
const TTL_MS = 5 * 60_000;
const { performance } = require("node:perf_hooks");

function workerName(jobId) {
  return `LouvorJA Downloads ${jobId}`;
}

/** Main-owned correlation; no paths, remote URLs or worker-supplied free text. */
function createWorkerDiagnostics({ now = Date.now, monotonicNow = () => performance.now(), enabled = false } = {}) {
  const workers = new Map();
  function prune() {
    const cutoff = now() - TTL_MS;
    for (const [name, entry] of workers) {
      if (entry.terminal && entry.observedAt < cutoff) workers.delete(name);
    }
    while (workers.size > MAX_WORKERS) workers.delete(workers.keys().next().value);
  }

  function record(raw) {
    if (!enabled || !raw || !UUID.test(raw.download_worker_id) || !UUID.test(raw.download_job_id) ||
        raw.download_worker_id !== raw.download_job_id) return;
    const safe = { download_worker_id: raw.download_worker_id, download_job_id: raw.download_job_id };
    if (PHASES.has(raw.download_worker_phase)) safe.download_worker_phase = raw.download_worker_phase;
    if (PHASES.has(raw.download_worker_termination_phase)) safe.download_worker_termination_phase = raw.download_worker_termination_phase;
    if (INTENTS.has(raw.download_worker_termination_intent)) safe.download_worker_termination_intent = raw.download_worker_termination_intent;
    if (KILL_RESULTS.has(raw.download_worker_kill_result)) safe.download_worker_kill_result = raw.download_worker_kill_result;
    if (REASONS.has(raw.download_worker_termination_reason)) safe.download_worker_termination_reason = raw.download_worker_termination_reason;
    if (typeof raw.download_worker_exit_observed === "boolean") safe.download_worker_exit_observed = raw.download_worker_exit_observed;
    for (const key of ["download_worker_pid", "download_worker_duration_ms", "download_worker_exit_code"]) {
      if (Number.isSafeInteger(raw[key]) && (key === "download_worker_exit_code" || raw[key] >= 0)) safe[key] = raw[key];
    }
    const name = workerName(raw.download_worker_id);
    workers.delete(name);
    workers.set(name, { context: safe, observedAt: now(), observedMonotonic: monotonicNow(),
      terminal: safe.download_worker_phase === "finishing" || safe.download_worker_phase === "exited" });
    prune();
  }

  function getChildProcessContext(details) {
    if (!enabled) return {};
    prune();
    if (details?.type !== "Utility" || typeof details.name !== "string") return {};
    const entry = workers.get(details.name);
    if (!entry) return {};
    const context = { ...entry.context };
    if (!context.download_worker_exit_observed && Number.isSafeInteger(context.download_worker_duration_ms)) {
      context.download_worker_duration_ms += Math.max(0, Math.round(monotonicNow() - entry.observedMonotonic));
    }
    return context;
  }

  function setEnabled(value) {
    enabled = value === true;
    if (!enabled) workers.clear();
  }

  return { record, getChildProcessContext, setEnabled };
}

module.exports = { createWorkerDiagnostics, workerName, MAX_WORKERS, TTL_MS };
