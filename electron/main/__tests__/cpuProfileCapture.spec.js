// @vitest-environment node
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { createCpuProfileCapture, COOLDOWN_MS } = require("../cpuProfileCapture.js");
const { summarizeCpuProfile } = require("../cpuProfileSummary.js");
const appRoot = path.join(os.tmpdir(), "lj-cpu-profile-fixture");
const ids = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
const incident = (index = 0) => ({ incident_type: "main_event_loop_stall", incident_id: ids[index],
  app_instance_id: ids[19], incident_status: "detected", window_role: "main", feature: "main_process", main_loop_max_ms: 1500 });
const sample = (start, end) => ({ main_sample_started_at_ms: start,
  main_sample_ended_at_ms: end, main_loop_max_ms: 1100, main_cpu_percent: 95, sample_window_ms: end - start });

function fixture() {
  let time = 100, consent = true, sequence = 10;
  const callbacks = [], cancellations = [], results = [];
  const backend = vi.fn((_configuration, callback) => {
    callbacks.push(callback);
    const cancel = vi.fn(); cancellations.push(cancel); return { cancel };
  });
  const capture = createCpuProfileCapture({ appRoot, now: () => time,
    wallNow: () => 1_800_000_000_000, enabled: () => consent, createId: () => ids[sequence++],
    onResult: (value) => results.push(value), mainBackend: backend });
  const summary = summarizeCpuProfile({ startTime: 1000, endTime: 21000,
    nodes: [{ id: 1, callFrame: { functionName: "slowWork", url: pathToFileURL(path.join(appRoot, "electron/main.cjs")).href, lineNumber: 4, columnNumber: 2 } }],
    samples: [1], timeDeltas: [20000] }, { appRoot, processType: "main" });
  return { capture, backend, callbacks, cancellations, results, summary,
    advance: (ms) => { time += ms; }, optOut: () => { consent = false; capture.cancel(); },
    optIn: () => { consent = true; }, started: (index = 0) => callbacks[index]({ type: "started", started_at_ms: time, activation_ms: 2 }),
    completed: (index = 0) => callbacks[index]({ type: "completed", started_at_ms: time - 20000,
      ended_at_ms: time, summary, sampling_interval_us: 20000 }) };
}

afterEach(() => vi.useRealTimers());

describe("incident-only CPU profile windows", () => {
  it("does not start workers, debugger or timers for healthy, irrelevant or opted-out flows", () => {
    vi.useFakeTimers();
    const state = fixture();
    state.capture.observeEventLoopSample({ ...sample(0, 100), main_loop_max_ms: 20 });
    state.capture.handleIncident({ ...incident(), incident_type: "child_process_gone" });
    state.capture.handleIncident({ ...incident(), main_loop_max_ms: 999 });
    state.capture.handleIncident({ ...incident(), incident_id: "path-or-title" });
    expect(state.backend).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    state.optOut();
    state.capture.handleIncident(incident());
    expect(state.backend).not.toHaveBeenCalled();
  });

  it("starts one coarse follow-up capture and correlates later histogram windows even during incident cooldown", () => {
    vi.useFakeTimers();
    const state = fixture();
    const context = state.capture.handleIncident(incident());
    expect(context.cpu_profile_status).toBe("scheduled");
    expect(state.backend).toHaveBeenCalledWith({ appRoot, durationMs: 20000,
      samplingIntervalUs: 20000 }, expect.any(Function));
    state.started();
    state.capture.observeEventLoopSample(sample(0, 100)); // Initial sample, before activation.
    state.advance(15000);
    state.capture.observeEventLoopSample(sample(100, 15100));
    const repeat = state.capture.handleIncident(incident(1));
    expect(repeat.cpu_profile_id).toBe(context.cpu_profile_id);
    expect(state.backend).toHaveBeenCalledOnce();
    state.advance(5000); state.completed();
    expect(state.results).toHaveLength(1);
    expect(state.results[0]).toMatchObject({ incident_type: "cpu_profile_window",
      app_instance_id: ids[19], cpu_profile_timing_basis: "sampled_elapsed_time",
      cpu_profile_relation: "followup_window", cpu_profile_trigger_incident_id: ids[0],
      cpu_profile_observed_incident_ids: [ids[1]],
      cpu_profile_observations: [{ sample_started_at_ms: 100, sample_ended_at_ms: 15100,
        max_delay_ms: 1100, main_cpu_percent: 95, sample_window_ms: 15000 }],
      cpu_profile_summary: { top_frames: [expect.objectContaining({ function: "slowWork" })] } });
    expect(state.cancellations[0]).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the 30-minute cooldown and three-capture budget through opt-out and opt-in", () => {
    vi.useFakeTimers(); const state = fixture();
    state.capture.handleIncident(incident()); state.started();
    state.advance(20000); state.completed();
    state.capture.handleIncident(incident(1));
    expect(state.backend).toHaveBeenCalledOnce();
    state.optOut(); state.optIn(); state.advance(COOLDOWN_MS);
    state.capture.handleIncident(incident(1)); state.started(1);
    state.advance(20000); state.completed(1);
    state.advance(COOLDOWN_MS); state.capture.handleIncident(incident(2));
    state.started(2); state.advance(20000); state.completed(2);
    state.advance(COOLDOWN_MS); state.capture.handleIncident(incident(3));
    expect(state.backend).toHaveBeenCalledTimes(3);
  });

  it("discards cancellation and late messages, including consent revoked before result delivery", () => {
    vi.useFakeTimers(); const state = fixture();
    state.capture.handleIncident(incident()); state.started();
    state.optOut(); state.advance(20000); state.completed();
    expect(state.results).toHaveLength(0);
    expect(state.cancellations[0]).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("deduplicates the trigger and later main incidents and caps recurrence observations", () => {
    vi.useFakeTimers(); const state = fixture();
    state.capture.handleIncident(incident());
    state.capture.handleIncident(incident(1)); // Scheduled, not sampled yet.
    state.started();
    state.capture.handleIncident(incident());
    for (const index of [1, 1, 2, 3, 4, 5]) state.capture.handleIncident(incident(index));
    for (let index = 1; index <= 5; index++) {
      state.advance(1000); state.capture.observeEventLoopSample(sample(100, 100 + index * 1000));
    }
    state.advance(15000); state.completed();
    expect(state.results[0].cpu_profile_observed_incident_ids).toEqual([ids[1], ids[2], ids[3], ids[4]]);
    expect(state.results[0].cpu_profile_observations).toHaveLength(4);
    expect(state.backend).toHaveBeenCalledOnce();
  });

  it("requires a valid started message before completion and rejects impossible bounds", () => {
    vi.useFakeTimers();
    for (const message of [
      { started_at_ms: 100, ended_at_ms: 20100 }, // No started message.
      { started_at_ms: 99, ended_at_ms: 20100, start: true },
      { started_at_ms: 101, ended_at_ms: 20100, start: true }, // Different from announced start.
      { started_at_ms: 100, ended_at_ms: 99, start: true },
      { started_at_ms: 100, ended_at_ms: 35101, start: true },
      { started_at_ms: 100, ended_at_ms: Infinity, start: true },
      { started_at_ms: 100, ended_at_ms: 1e308, start: true },
      { started_at_ms: 100, ended_at_ms: 30100, start: true }, // Future worker timestamp.
    ]) {
      const state = fixture(); state.capture.handleIncident(incident());
      if (message.start) state.started();
      state.advance(20000);
      state.callbacks[0]({ type: "completed", summary: state.summary, ...message });
      expect(state.results[0].cpu_profile_status).toBe("unavailable");
      expect(state.results[0].cpu_profile_summary).toBeUndefined();
      expect(state.cancellations[0]).toHaveBeenCalledOnce();
    }
  });

  it("ignores duplicate or invalid started messages and accepts delayed native-call completion within 35 seconds", () => {
    vi.useFakeTimers(); const state = fixture(); state.capture.handleIncident(incident());
    state.callbacks[0]({ type: "started", started_at_ms: 99, activation_ms: 2 });
    state.capture.handleIncident(incident(1));
    expect(state.capture.handleIncident(incident(2)).cpu_profile_status).toBe("scheduled");
    state.started();
    state.callbacks[0]({ type: "started", started_at_ms: 200, activation_ms: 10 });
    state.advance(30000);
    state.callbacks[0]({ type: "completed", started_at_ms: 100, ended_at_ms: 30100, summary: state.summary });
    expect(state.results[0]).toMatchObject({ cpu_profile_status: "completed", cpu_profile_started_at_ms: 100,
      cpu_profile_duration_ms: 30000, cpu_profile_activation_ms: 2 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("limits stalled backends and rejects arbitrary summary data without changing application flow", () => {
    vi.useFakeTimers(); const state = fixture();
    state.capture.handleIncident(incident());
    vi.advanceTimersByTime(35000);
    expect(state.results[0]).toMatchObject({ cpu_profile_status: "unavailable", cpu_profile_reason: "capture_failed" });
    expect(state.cancellations[0]).toHaveBeenCalledOnce();
    state.advance(COOLDOWN_MS); state.capture.handleIncident(incident(1));
    state.callbacks[1]({ type: "completed", started_at_ms: 100, ended_at_ms: 20100,
      summary: { source: "file:///private/secret", token: "private" } });
    expect(state.results[1].cpu_profile_summary).toBeUndefined();
    expect(JSON.stringify(state.results)).not.toContain("private");
  });
});
