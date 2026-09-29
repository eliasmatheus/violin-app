// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { createRuntimeWorkDiagnostics } = require("../runtimeWorkDiagnostics.js");

function fixture() {
  let time = 0, consent = true;
  const diagnostics = createRuntimeWorkDiagnostics({ now: () => time, enabled: () => consent,
    cpuUsage: (previous) => previous ? { user: 850000, system: 100000 } : { user: 0, system: 0 } });
  return { diagnostics, advance: (ms) => { time += ms; }, disable: () => { consent = false; } };
}

describe("synchronous runtime work evidence", () => {
  it("measures native-call wall and CPU time, preserves returned value and reports no promise wait as blocking", () => {
    const state = fixture();
    const promise = Promise.resolve("loaded");
    expect(state.diagnostics.measure("window.construct", { feature: "file_projection" }, () => {
      state.advance(1600); return promise;
    })).toBe(promise);
    expect(state.diagnostics.snapshot()).toEqual([expect.objectContaining({ operation: "window.construct",
      feature: "file_projection", duration_ms: 1600, cpu_user_ms: 850, cpu_system_ms: 100,
      timing_basis: "synchronous_call", started_at_ms: 0, ended_at_ms: 1600 })]);
    state.advance(10000);
    expect(state.diagnostics.snapshot()[0].duration_ms).toBe(1600);
  });

  it("executes a throwing operation exactly once with diagnostics disabled or broken", () => {
    const failure = new Error("native failure");
    for (const options of [{}, { enabled: () => true, cpuUsage: () => { throw new Error("diagnostic failed"); } },
      { enabled: () => { throw new Error("consent failed"); } }]) {
      const diagnostics = createRuntimeWorkDiagnostics(options);
      const run = vi.fn(() => { throw failure; });
      expect(() => diagnostics.measure("window.construct", {}, run)).toThrow(failure);
      expect(run).toHaveBeenCalledOnce();
    }
  });

  it("records a slow exception without replacing it and removes history after opt-out/expiry", () => {
    const state = fixture();
    const failure = new Error("native failure");
    expect(() => state.diagnostics.measure("window.show", {}, () => { state.advance(1000); throw failure; })).toThrow(failure);
    expect(state.diagnostics.snapshot()[0].status).toBe("threw");
    state.advance(60001);
    expect(state.diagnostics.snapshot()).toEqual([]);
    state.diagnostics.measure("window.show", {}, () => state.advance(1000));
    state.disable();
    expect(state.diagnostics.snapshot()).toEqual([]);
  });

  it("excludes native calls from previous samples and bounds overlap to the incident window", () => {
    const state = fixture();
    state.diagnostics.measure("window.construct", {}, () => state.advance(1000));
    state.advance(15000);
    state.diagnostics.measure("window.fullscreen", {}, () => state.advance(2000));
    expect(state.diagnostics.snapshot(17000, 20000)).toEqual([expect.objectContaining({
      operation: "window.fullscreen", duration_ms: 2000, sample_overlap_ms: 1000,
    })]);
  });
});
