// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import os from "node:os";

const require = createRequire(import.meta.url);
const { createWorkerDiagnostics, workerName, TTL_MS, MAX_WORKERS } = require("../download/workerDiagnostics.js");
const { UtilityQueue } = require("../download/utilityQueue.js");
const { createRuntimeHealthMonitor } = require("../runtimeHealth.js");
const id = "61c9a013-c089-4dab-8a99-136578c7bbc0";
const details = (job = id) => ({ type: "Utility", name: workerName(job), serviceName: "node.mojom.NodeService" });
const record = (job = id) => ({ download_worker_id: job, download_job_id: job,
  download_worker_phase: "downloading", download_worker_duration_ms: 250, download_worker_pid: 4321,
  download_worker_exit_observed: false, download_worker_termination_intent: "none",
  download_worker_kill_result: "not_requested" });

describe("download worker diagnostics", () => {
  function monitoredQueue(enabled = true) {
    let elapsed = 0;
    const ledger = createWorkerDiagnostics({ enabled, monotonicNow: () => elapsed });
    const app = new EventEmitter();
    const incidents = [];
    const monitor = createRuntimeHealthMonitor({ getChildProcessContext: ledger.getChildProcessContext,
      emitIncident: (incident) => incidents.push(incident) });
    monitor.watchApp(app);
    const child = new EventEmitter();
    child.pid = 4321;
    child.postMessage = vi.fn();
    child.kill = vi.fn(() => true);
    const queue = new UtilityQueue({ filesDir: os.tmpdir(), monotonicNow: () => elapsed,
      reportDiagnostic: ledger.record, fork: () => child });
    queue.add([{ remote: "/file", local: "file" }]);
    const emit = (type, data) => child.emit("message", { version: 1, jobId: queue.jobId, type, data });
    const gone = (reason = "killed", exitCode = 15) => app.emit("child-process-gone", {}, {
      ...details(queue.jobId), reason, exitCode,
    });
    return { ledger, incidents, monitor, child, queue, emit, gone, advance: (ms) => { elapsed += ms; } };
  }

  it("correlates the actual app event emitted during kill with intent already recorded, preserving severity", async () => {
    const fixture = monitoredQueue();
    const completion = fixture.queue.start();
    fixture.child.emit("spawn");
    fixture.emit("ready");
    fixture.emit("started");
    fixture.advance(250);
    fixture.child.kill.mockImplementation(() => { fixture.gone(); fixture.child.emit("exit", 15); return true; });
    fixture.emit("queue-done", { downloaded: 1, failed: 0 });
    await completion;
    expect(fixture.incidents).toHaveLength(1);
    expect(fixture.incidents[0]).toMatchObject({ incident_type: "child_process_gone", severity: "error",
      reason: "killed", exit_code: 15, service_name: "node.mojom.NodeService",
      download_worker_id: fixture.queue.jobId, download_job_id: fixture.queue.jobId,
      download_worker_pid: 4321, download_worker_duration_ms: 250,
      download_worker_termination_intent: "completed", download_worker_termination_phase: "downloading",
      download_worker_kill_result: "pending" });
    fixture.monitor.stop();
  });

  it("correlates an unexpected app exit before the queue exit callback without calling it an intentional kill", async () => {
    const fixture = monitoredQueue();
    const completion = fixture.queue.start();
    fixture.child.emit("spawn");
    fixture.emit("ready");
    fixture.emit("started");
    fixture.advance(250);
    fixture.gone("crashed", 1);
    fixture.child.emit("exit", 1);
    await completion;
    expect(fixture.incidents[0]).toMatchObject({ severity: "error", reason: "crashed", exit_code: 1,
      download_worker_id: fixture.queue.jobId, download_worker_duration_ms: 250,
      download_worker_phase: "downloading", download_worker_termination_intent: "none",
      download_worker_kill_result: "not_requested" });
    fixture.monitor.stop();
  });

  it("keeps download shutdown working with opt-out and attaches no retained correlation to the app event", async () => {
    const fixture = monitoredQueue();
    const completion = fixture.queue.start();
    fixture.child.emit("spawn");
    fixture.emit("ready");
    fixture.emit("started");
    fixture.ledger.setEnabled(false);
    fixture.child.kill.mockImplementation(() => { fixture.gone(); return true; });
    fixture.emit("queue-done", { downloaded: 1, failed: 0 });
    await completion;
    expect(fixture.child.kill).toHaveBeenCalledOnce();
    expect(fixture.incidents[0]).toMatchObject({ incident_type: "child_process_gone", reason: "killed", severity: "error" });
    expect(fixture.incidents[0]).not.toHaveProperty("download_worker_id");
    fixture.monitor.stop();
  });

  it("matches exact main-owned worker names and keeps independent old/new queue contexts", () => {
    const ledger = createWorkerDiagnostics({ enabled: true });
    const next = "62c9a013-c089-4dab-8a99-136578c7bbc0";
    ledger.record(record());
    ledger.record({ ...record(next), download_worker_pid: 5432 });
    expect(ledger.getChildProcessContext(details())).toMatchObject({ download_worker_id: id, download_worker_pid: 4321 });
    expect(ledger.getChildProcessContext(details(next))).toMatchObject({ download_worker_id: next, download_worker_pid: 5432 });
    expect(ledger.getChildProcessContext({ ...details(), type: "GPU" })).toEqual({});
    expect(ledger.getChildProcessContext({ ...details(), name: `${workerName(id)} extra` })).toEqual({});
    expect(ledger.getChildProcessContext({ ...details(), name: "LouvorJA Downloads" })).toEqual({});
  });

  it("does not collect without consent and clears all correlation on opt-out", () => {
    const ledger = createWorkerDiagnostics();
    ledger.record(record());
    expect(ledger.getChildProcessContext(details())).toEqual({});
    ledger.setEnabled(true);
    ledger.record(record());
    expect(ledger.getChildProcessContext(details())).toMatchObject({ download_worker_id: id });
    ledger.setEnabled(false);
    ledger.record(record());
    expect(ledger.getChildProcessContext(details())).toEqual({});
    ledger.setEnabled(true);
    expect(ledger.getChildProcessContext(details())).toEqual({});
  });

  it("stores only bounded identifiers, enums and numbers, without paths, tokens or arbitrary context", () => {
    const ledger = createWorkerDiagnostics({ enabled: true });
    ledger.record({ ...record(), token: "secret", localPath: "/private/music", remoteUrl: "https://secret.test",
      download_worker_termination_reason: "/private/music" });
    const context = ledger.getChildProcessContext(details());
    expect(context).not.toHaveProperty("token");
    expect(context).not.toHaveProperty("localPath");
    expect(context).not.toHaveProperty("remoteUrl");
    expect(context).not.toHaveProperty("download_worker_termination_reason");
    ledger.record({ ...record(), download_worker_id: "/private/music" });
    expect(ledger.getChildProcessContext({ type: "Utility", name: workerName("/private/music") })).toEqual({});
  });

  it("expires finished workers but keeps long-running workers and calculates duration with the monotonic clock", () => {
    let wallClock = 0;
    let monotonic = 0;
    const ledger = createWorkerDiagnostics({ enabled: true, now: () => wallClock, monotonicNow: () => monotonic });
    ledger.record(record());
    wallClock = TTL_MS * 2;
    monotonic = 750;
    expect(ledger.getChildProcessContext(details())).toMatchObject({ download_worker_duration_ms: 1000 });
    ledger.record({ ...record(), download_worker_phase: "exited", download_worker_exit_observed: true,
      download_worker_duration_ms: 1000 });
    monotonic = 100_000;
    expect(ledger.getChildProcessContext(details())).toMatchObject({ download_worker_duration_ms: 1000 });
    wallClock += TTL_MS + 1;
    expect(ledger.getChildProcessContext(details())).toEqual({});
  });

  it("caps retained workers without timers or persistent storage", () => {
    const ledger = createWorkerDiagnostics({ enabled: true });
    const jobs = Array.from({ length: MAX_WORKERS + 1 }, (_, n) => `${n.toString(16).padStart(8, "0")}-c089-4dab-8a99-136578c7bbc0`);
    for (const job of jobs) ledger.record(record(job));
    expect(ledger.getChildProcessContext(details(jobs[0]))).toEqual({});
    expect(ledger.getChildProcessContext(details(jobs.at(-1)))).toMatchObject({ download_worker_id: jobs.at(-1) });
  });
});
