// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createFrameDiagnostics } from "../FrameDiagnostics";

const frame = (duration: number, scripts: unknown[] = [], blockingDuration = duration - 50) =>
  ({
    entryType: "long-animation-frame",
    startTime: 1000,
    duration,
    blockingDuration,
    styleAndLayoutStart: 1000 + duration - 30,
    scripts,
  }) as unknown as PerformanceEntry;

let diagnostics: ReturnType<typeof createFrameDiagnostics> | null = null;
afterEach(() => diagnostics?.stop());

describe("FrameDiagnostics", () => {
  it("não gera log quando o período foi tranquilo", () => {
    diagnostics = createFrameDiagnostics();
    diagnostics.noteFrame(frame(60, [{ duration: 20, sourceURL: "louvorja://app/assets/a.js" }]));
    expect(diagnostics.flush()).toBeNull();
  });

  it("separa script de layout e aponta o script mais caro", () => {
    diagnostics = createFrameDiagnostics();
    const script = {
      duration: 200,
      forcedStyleAndLayoutDuration: 40,
      sourceURL: "louvorja://app/assets/Index-CViLbZYs.js?v=1",
      sourceFunctionName: "render",
      invoker: "BUTTON.onclick",
    };
    for (let i = 0; i < 3; i++) diagnostics.noteFrame(frame(250, [script]));
    const report = diagnostics.flush();
    expect(report).toMatchObject({
      slow_frame_count: 3,
      slow_frame_total_ms: 750,
      slow_frame_layout_ms: 90,
      slow_frame_script_ms: 600,
      slow_frame_forced_layout_ms: 120,
    });
    expect((report?.top_scripts as Array<{ name: string }>)[0].name).toBe(
      "Index.js:render:BUTTON.onclick"
    );
    expect(diagnostics.flush()).toBeNull();
  });

  it("ignora quadro sem script nem bloqueio, que é janela sem pintar", () => {
    diagnostics = createFrameDiagnostics();
    for (let i = 0; i < 5; i++) diagnostics.noteFrame(frame(1005, [], 0));
    expect(diagnostics.flush()).toBeNull();
  });

  it("marca o intervalo em que o seletor de arquivo esteve aberto", () => {
    diagnostics = createFrameDiagnostics();
    expect(diagnostics.nativePickerOverlaps(0, 1e9)).toBe(false);
    const input = document.createElement("input");
    input.type = "file";
    document.body.append(input);
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const now = performance.now();
    expect(diagnostics.nativePickerOverlaps(now - 10, 60_000)).toBe(true);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(diagnostics.nativePickerOverlaps(performance.now() + 1_000, 500)).toBe(false);
  });
});
