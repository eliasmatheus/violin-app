"use strict";

const { performance } = require("node:perf_hooks");
const OPERATIONS = new Set(["window.open", "window.construct", "window.show", "window.position", "window.fullscreen", "main_window.construct"]);
const MAX_RECORDS = 32;

/** Measures only synchronous calls. It never wraps/awaits the returned promise. */
function createRuntimeWorkDiagnostics({ now = () => performance.now(), cpuUsage = process.cpuUsage, enabled = () => false } = {}) {
  const recent = [];
  function clear() { recent.length = 0; }
  function measure(operation, details, run) {
    let start, cpuStart, collect = false;
    try {
      collect = enabled() && OPERATIONS.has(operation);
      if (collect) { start = now(); cpuStart = cpuUsage(); }
    } catch { collect = false; }
    if (!collect) return run();
    let status = "completed";
    try { return run(); } catch (error) { status = "threw"; throw error; } finally {
      // Failure to collect diagnostics must preserve the operation's result/error.
      try {
        const end = now();
        const duration = Math.max(0, end - start);
        if (duration >= 50) {
          const cpu = cpuUsage(cpuStart);
          recent.push({
            operation, status,
            feature: typeof details?.feature === "string" ? details.feature.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 64) : "unknown",
            started_at_ms: Math.round(start), ended_at_ms: Math.round(end),
            duration_ms: Math.round(duration),
            cpu_user_ms: Math.round(cpu.user / 1000), cpu_system_ms: Math.round(cpu.system / 1000),
            timing_basis: "synchronous_call",
          });
          if (recent.length > MAX_RECORDS) recent.shift();
        }
      } catch { /* best-effort */ }
    }
  }
  function snapshot(sampleStart, sampleEnd) {
    if (!enabled()) { clear(); return []; }
    const cutoff = now() - 60_000;
    while (recent[0] && recent[0].ended_at_ms < cutoff) recent.shift();
    const inSample = Number.isFinite(sampleStart) && Number.isFinite(sampleEnd);
    return recent.filter((record) => !inSample || (record.started_at_ms < sampleEnd && record.ended_at_ms > sampleStart))
      .slice(-8).map((record) => ({ ...record,
        ...(inSample ? { sample_overlap_ms: Math.max(0, Math.round(Math.min(record.ended_at_ms, sampleEnd) - Math.max(record.started_at_ms, sampleStart))) } : {}),
      }));
  }
  return { measure, snapshot, clear };
}

module.exports = { createRuntimeWorkDiagnostics };
