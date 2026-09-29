"use strict";

const { performance } = require("node:perf_hooks");
const { isAbsolute } = require("node:path");
const { isMainThread, parentPort, workerData } = require("node:worker_threads");

const CAPTURE_DURATION_MS = 20_000;
const COMMAND_TIMEOUT_MS = 5_000;
const SAMPLING_INTERVALS_US = new Set([20_000, 50_000]);

/**
 * The worker owns the timers and summarization so a busy main JS thread cannot
 * postpone stopping a profile. A native/OS call can still defer Inspector
 * commands; cancellation disconnects the session on a best-effort basis.
 */
function createMainCpuProfileWorker(data, dependencies = {}) {
  const port = dependencies.port || parentPort;
  const now = dependencies.now || (() => performance.now());
  const setTimeoutFn = dependencies.setTimeout || setTimeout;
  const clearTimeoutFn = dependencies.clearTimeout || clearTimeout;
  const setIntervalFn = dependencies.setInterval || setInterval;
  const clearIntervalFn = dependencies.clearInterval || clearInterval;
  const summarize =
    dependencies.summarize ||
    ((profile, options) => require("./cpuProfileSummary").summarizeCpuProfile(profile, options));

  let session;
  let finished = false;
  let startRequested = false;
  let startedAt = null;
  let startTimer;
  let stopTimer;
  let stopRequestTimer;
  let keepAlive;
  let onMessage;

  function finish(message) {
    if (finished) return;
    finished = true;
    clearTimeoutFn(startTimer);
    clearTimeoutFn(stopTimer);
    clearTimeoutFn(stopRequestTimer);
    clearIntervalFn(keepAlive);
    try {
      if (onMessage) port?.off("message", onMessage);
    } catch {
      /* Closed port. */
    }
    try {
      session?.disconnect();
    } catch {
      /* Backend may have gone away. */
    }
    if (message) {
      try {
        port?.postMessage(message);
      } catch {
        /* Parent stopped the capture. */
      }
    }
    try {
      port?.close();
    } catch {
      /* Already closed. */
    }
  }

  function unavailable(reason) {
    finish({ type: "unavailable", reason });
  }

  async function stop() {
    if (finished || startedAt === null) return;
    stopRequestTimer = setTimeoutFn(() => unavailable("stop_timeout"), COMMAND_TIMEOUT_MS);
    try {
      const result = await session.post("Profiler.stop");
      if (finished) return;
      clearTimeoutFn(stopRequestTimer);
      const endedAt = now();
      let summary;
      try {
        summary = summarize(result?.profile, { appRoot: data.app_root, processType: "main" });
        if (!summary) {
          unavailable("summary_failed");
          return;
        }
      } catch {
        unavailable("summary_failed");
        return;
      }
      if (finished) return;
      finish({
        type: "completed",
        started_at_ms: startedAt,
        ended_at_ms: endedAt,
        duration_ms: Math.max(0, endedAt - startedAt),
        sampling_interval_us: data.sampling_interval_us,
        summary,
      });
    } catch {
      if (!finished) unavailable("capture_failed");
    }
  }

  async function start() {
    if (finished || startRequested) return;
    startRequested = true;
    if (
      !port ||
      data?.duration_ms !== CAPTURE_DURATION_MS ||
      !SAMPLING_INTERVALS_US.has(data?.sampling_interval_us) ||
      typeof data?.app_root !== "string" ||
      data.app_root.length > 1024 ||
      !isAbsolute(data.app_root)
    ) {
      unavailable("invalid_options");
      return;
    }

    try {
      const requestedAt = now();
      onMessage = (message) => {
        if (message?.type === "cancel") finish();
      };
      port.on("message", onMessage);
      // Inspector promises do not keep a worker alive on their own.
      keepAlive = setIntervalFn(() => {}, 1000);
      startTimer = setTimeoutFn(() => unavailable("start_timeout"), COMMAND_TIMEOUT_MS);
      const Session = dependencies.Session || require("node:inspector/promises").Session;
      session = new Session();
      session.connectToMainThread();
      await session.post("Profiler.enable");
      if (finished) return;
      await session.post("Profiler.setSamplingInterval", { interval: data.sampling_interval_us });
      if (finished) return;
      await session.post("Profiler.start");
      if (finished) return;
      clearTimeoutFn(startTimer);
      startedAt = now();
      stopTimer = setTimeoutFn(() => {
        void stop();
      }, data.duration_ms);
      port.postMessage({
        type: "started",
        started_at_ms: startedAt,
        activation_ms: Math.max(0, startedAt - requestedAt),
      });
    } catch {
      if (!finished) unavailable(startedAt === null ? "backend_unavailable" : "capture_failed");
    }
  }

  return { start, cancel: () => finish() };
}

if (!isMainThread) {
  const worker = createMainCpuProfileWorker(workerData);
  void worker.start();
}

module.exports = { createMainCpuProfileWorker, CAPTURE_DURATION_MS, COMMAND_TIMEOUT_MS };
