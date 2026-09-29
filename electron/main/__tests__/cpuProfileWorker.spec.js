// @vitest-environment node
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { resolve as resolvePath } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { createMainCpuProfileWorker } = require("../cpuProfileWorker.js");

const appRoot = resolvePath("application");
const options = { duration_ms: 20_000, sampling_interval_us: 20_000, app_root: appRoot };

function fixture(post = async () => ({})) {
  vi.useFakeTimers();
  const port = new EventEmitter();
  port.postMessage = vi.fn();
  port.close = vi.fn();
  const session = { connectToMainThread: vi.fn(), disconnect: vi.fn(), post: vi.fn(post) };
  const summarize = vi.fn(() => ({
    top_stacks: [{ frames: [{ function_name: "knownLocalWork" }] }],
  }));
  const worker = createMainCpuProfileWorker(options, {
    port,
    now: () => Date.now(),
    Session: function () {
      return session;
    },
    summarize,
  });
  return { worker, port, session, summarize };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("main CPU capture worker", () => {
  it("stops from its own deadline, sends only the summary and releases the Inspector session", async () => {
    const raw = { nodes: [{ privateSource: "never send raw frames" }], samples: [1, 1] };
    const state = fixture(async (method) => (method === "Profiler.stop" ? { profile: raw } : {}));
    await state.worker.start();
    expect(state.session.post.mock.calls.map(([method]) => method)).toEqual([
      "Profiler.enable",
      "Profiler.setSamplingInterval",
      "Profiler.start",
    ]);
    expect(state.port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "started" })
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(state.summarize).toHaveBeenCalledWith(raw, {
      appRoot,
      processType: "main",
    });
    const completion = state.port.postMessage.mock.calls[1][0];
    expect(completion).toMatchObject({
      type: "completed",
      duration_ms: 20_000,
      sampling_interval_us: 20_000,
    });
    expect(JSON.stringify(completion)).not.toContain("privateSource");
    expect(state.session.disconnect).toHaveBeenCalledOnce();
    expect(state.port.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards a pending start after cancellation, including a late Inspector response", async () => {
    let resolve;
    const state = fixture((method) =>
      method === "Profiler.start"
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve({})
    );
    const starting = state.worker.start();
    await vi.advanceTimersByTimeAsync(0);
    state.port.emit("message", { type: "cancel" });
    resolve({});
    await starting;
    expect(state.port.postMessage).not.toHaveBeenCalled();
    expect(state.summarize).not.toHaveBeenCalled();
    expect(state.session.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends a stalled activation with a bounded reason instead of hanging the worker", async () => {
    let resolve;
    const state = fixture(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const starting = state.worker.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.port.postMessage).toHaveBeenCalledWith({
      type: "unavailable",
      reason: "start_timeout",
    });
    expect(state.session.disconnect).toHaveBeenCalledOnce();
    resolve({});
    await starting;
    expect(state.session.post).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards a completed raw profile when cancellation wins the pending stop", async () => {
    let resolve;
    const state = fixture((method) =>
      method === "Profiler.stop"
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve({})
    );
    await state.worker.start();
    await vi.advanceTimersByTimeAsync(20_000);
    state.port.emit("message", { type: "cancel" });
    resolve({ profile: { nodes: [{ privateSource: "secret" }] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.port.postMessage).toHaveBeenCalledTimes(1);
    expect(state.summarize).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects unbounded options and catches unavailable backends without leaking their error", async () => {
    const state = fixture();
    const invalid = createMainCpuProfileWorker(
      { ...options, duration_ms: 3600_000 },
      { port: state.port }
    );
    await invalid.start();
    expect(state.port.postMessage).toHaveBeenCalledWith({
      type: "unavailable",
      reason: "invalid_options",
    });
    const failure = fixture(() => Promise.reject(new Error("private details")));
    await failure.worker.start();
    expect(failure.port.postMessage).toHaveBeenCalledWith({
      type: "unavailable",
      reason: "backend_unavailable",
    });
    expect(JSON.stringify(failure.port.postMessage.mock.calls)).not.toContain("private details");
    expect(failure.session.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a blocked stop and does not publish any later profile", async () => {
    let resolve;
    const state = fixture((method) =>
      method === "Profiler.stop"
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve({})
    );
    await state.worker.start();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(state.port.postMessage).toHaveBeenLastCalledWith({
      type: "unavailable",
      reason: "stop_timeout",
    });
    resolve({ profile: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.summarize).not.toHaveBeenCalled();
    expect(state.port.postMessage).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps exactly one session when start is called again during activation", async () => {
    let resolve;
    const state = fixture(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const starting = state.worker.start();
    await state.worker.start();
    expect(state.session.connectToMainThread).toHaveBeenCalledOnce();
    expect(state.session.post).toHaveBeenCalledTimes(1);
    state.worker.cancel();
    resolve({});
    await starting;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards malformed profile data rejected by the summary boundary", async () => {
    const state = fixture(async (method) => (method === "Profiler.stop" ? { profile: {} } : {}));
    state.summarize.mockReturnValue(null);
    await state.worker.start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(state.port.postMessage).toHaveBeenLastCalledWith({
      type: "unavailable",
      reason: "summary_failed",
    });
    expect(state.session.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
