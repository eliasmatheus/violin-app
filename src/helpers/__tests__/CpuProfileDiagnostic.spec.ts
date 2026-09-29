import { describe, expect, it } from "vitest";
import { cpuProfileLogSummary } from "../CpuProfileDiagnostic";

const caller = { function: "dispatch", source: "electron/main.cjs", line: 10, column: 4 };
const leaf = { function: "controlledBurn", source: "src/helpers/run.ts", line: 20, column: 1 };
function fixture() {
  return {
    sample_count: 3,
    sampled_duration_ms: 20,
    idle_ms: 5,
    gc_ms: 0,
    program_ms: 0,
    unattributed_ms: 0,
    top_frames: [{ ...leaf, sample_count: 2, self_sample_ms: 15 }],
    top_stacks: [{ sample_count: 2, sampled_ms: 15, frames: [caller, leaf] }],
  };
}

describe("CPU summary telemetry boundary", () => {
  it("keeps weighted evidence and callers as strings without mutating the safe input", () => {
    const input = fixture();
    const result = cpuProfileLogSummary(input);
    expect(result).toEqual({
      ...input,
      top_stacks: [
        {
          sample_count: 2,
          sampled_ms: 15,
          frames: ["dispatch (electron/main.cjs:10:4)", "controlledBurn (src/helpers/run.ts:20:1)"],
        },
      ],
    });
    expect(input.top_stacks[0].frames[0]).toEqual(caller);
    expect(result?.top_frames[0]).not.toBe(input.top_frames[0]);
    const native = { function: "native", source: "native", line: null, column: null };
    expect(
      cpuProfileLogSummary({
        ...input,
        unattributed_ms: 15,
        top_frames: [{ ...native, sample_count: 2, self_sample_ms: 15 }],
        top_stacks: [{ sample_count: 2, sampled_ms: 15, frames: [caller, native] }],
      })?.top_stacks[0].frames
    ).toEqual(["dispatch (electron/main.cjs:10:4)", "native (native:?:?)"]);
  });

  it("rejects malicious frames, paths, labels, extra fields and impossible values without throwing", () => {
    const valid = fixture();
    const invalid: unknown[] = [
      null,
      {},
      { ...valid, rawProfile: "private" },
      { ...valid, sample_count: 10001 },
      { ...valid, gc_ms: Infinity },
      { ...valid, idle_ms: 21 },
      { ...valid, top_frames: [valid.top_frames[0], valid.top_frames[0]] },
      ...[
        "https://private.example/source.js?token=secret",
        "/Users/private/script.js",
        "src/../private.js",
        "assets/probe.js#secret",
      ].map((source) => ({ ...valid, top_frames: [{ ...valid.top_frames[0], source }] })),
      ...["é", "eval at leaked(path)", "x".repeat(121), "control\nname"].map((name) => ({
        ...valid,
        top_frames: [{ ...valid.top_frames[0], function: name }],
      })),
      {
        ...valid,
        top_frames: [{ ...valid.top_frames[0], source: "external", function: "privateFunction" }],
      },
      {
        ...valid,
        top_stacks: [{ ...valid.top_stacks[0], frames: [{ ...caller, token: "secret" }] }],
      },
      Object.defineProperty({}, "sample_count", {
        get() {
          throw new Error("untrusted getter");
        },
      }),
    ];
    for (const input of invalid) {
      expect(() => cpuProfileLogSummary(input)).not.toThrow();
      expect(cpuProfileLogSummary(input)).toBeNull();
    }
  });

  it("enforces entry/depth/byte caps and keeps each formatted frame within 256 ASCII characters", () => {
    const valid = fixture();
    expect(
      cpuProfileLogSummary({ ...valid, top_frames: Array(9).fill(valid.top_frames[0]) })
    ).toBeNull();
    expect(
      cpuProfileLogSummary({ ...valid, top_stacks: Array(6).fill(valid.top_stacks[0]) })
    ).toBeNull();
    expect(
      cpuProfileLogSummary({
        ...valid,
        top_stacks: [{ ...valid.top_stacks[0], frames: Array(7).fill(caller) }],
      })
    ).toBeNull();
    const longFrame = {
      function: "f".repeat(120),
      source: `electron/${"x".repeat(145)}/x.js`,
      line: Number.MAX_SAFE_INTEGER,
      column: Number.MAX_SAFE_INTEGER,
    };
    const bounded = cpuProfileLogSummary({
      ...valid,
      top_stacks: [{ ...valid.top_stacks[0], frames: [longFrame] }],
    });
    expect(bounded?.top_stacks[0].frames[0]).toHaveLength(256);
    expect(bounded?.top_stacks[0].frames[0]).toMatch(/\.\.\.:9007199254740991:9007199254740991\)$/);
    const oversized = {
      ...valid,
      sample_count: 5,
      sampled_duration_ms: 5,
      idle_ms: 0,
      top_frames: [],
      top_stacks: Array.from({ length: 5 }, () => ({
        sample_count: 1,
        sampled_ms: 1,
        frames: Array(6).fill(longFrame),
      })),
    };
    expect(JSON.stringify(oversized).length).toBeGreaterThan(8192);
    expect(cpuProfileLogSummary(oversized)).toBeNull();
  });
});
