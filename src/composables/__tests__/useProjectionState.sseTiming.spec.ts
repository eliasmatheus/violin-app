import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";

const telemetry = vi.hoisted(() => ({ track: vi.fn(), histogram: vi.fn() }));
vi.mock("@/helpers/Telemetry", () => ({
  default: telemetry, isProjectionMilestone: () => true,
}));
vi.mock("@/helpers/Platform", () => ({ default: { isDesktop: false } }));

type SseWindow = Window & { __ljBroadcastInit?: boolean; __ljSseBuffer?: unknown[]; __ljSseDrained?: boolean;
  LJ_REMOTE_CLIENT?: boolean };
const sseWindow = window as SseWindow;

describe("projection timing through the real SSE Broadcast bridge", () => {
  let wrapper: VueWrapper | null;
  let frames: FrameRequestCallback[];
  let bridgeListeners: EventListenerOrEventListenerObject[];
  beforeEach(() => {
    vi.resetModules();
    telemetry.track.mockClear();
    telemetry.histogram.mockClear();
    wrapper = null;
    frames = [];
    bridgeListeners = [];
    delete sseWindow.__ljBroadcastInit;
    sseWindow.__ljSseBuffer = [];
    // Set by the server's SPA bridge script before the Vue bundle loads.
    sseWindow.LJ_REMOTE_CLIENT = true;
    const addListener = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
      if (type === "louvorja-sse") bridgeListeners.push(listener);
      addListener(type, listener, options);
    });
    vi.stubGlobal("BroadcastChannel", class { addEventListener() {} postMessage() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.spyOn(Date, "now").mockReturnValue(60_000);
  });
  afterEach(() => {
    wrapper?.unmount();
    for (const listener of bridgeListeners) window.removeEventListener("louvorja-sse", listener);
    delete sseWindow.__ljBroadcastInit;
    delete sseWindow.__ljSseBuffer;
    delete sseWindow.__ljSseDrained;
    delete sseWindow.LJ_REMOTE_CLIENT;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["live", "boot-buffer"])("omits cross-machine timing with 30s positive clock skew through %s", async (mode) => {
    const message = {
      type: BROADCAST_TYPE.MUSIC_PRESENTATION_SNAPSHOT,
      payload: { schema: 1, selectionRevision: 4, progress: 0, slideProgress: 0,
        emittedAt: 29_975, commandAt: 29_955, commitAt: 29_965,
        delivery: { kind: "update", sentAt: 29_975 },
        snapshot: { sessionId: "sse", revision: 4, active: true, title: "Remote",
          slideIndex: 0, totalSlides: 1, slide: { lyric: "Remote slide" }, nextSlide: null } },
    };
    if (mode === "boot-buffer") sseWindow.__ljSseBuffer = [message];
    const { useProjectionState } = await import("@/composables/useProjectionState");
    wrapper = mount(defineComponent({ setup() {
      const state = useProjectionState();
      return () => h("div", String(state.slide.value?.lyric ?? ""));
    } }));
    if (mode === "live") window.dispatchEvent(new CustomEvent("louvorja-sse", { detail: message }));
    await nextTick();
    for (let i = 0; i < 2; i++) {
      const callbacks = frames.splice(0);
      for (const callback of callbacks) callback(performance.now());
    }
    expect(wrapper.text()).toBe("Remote slide");
    const received = telemetry.track.mock.calls.find(([name]) => name === "projection_broadcast_received")?.[1];
    expect(received).toMatchObject({ clock_basis: "receiver", received_via: "sse" });
    expect(received).not.toHaveProperty("latency_ms");
    expect(received).not.toHaveProperty("state_age_ms");
    const frame = telemetry.track.mock.calls.find(([name]) => name === "projection_slide_frame_opportunity")?.[1];
    expect(frame).toMatchObject({ clock_basis: "receiver", receive_to_frame_ms: 0,
      receive_to_state_apply_ms: 0, state_apply_to_dom_ms: 0, dom_to_frame_ms: 0 });
    for (const name of ["broadcast_to_receive_ms", "broadcast_to_frame_ms", "state_age_ms",
      "command_to_frame_ms", "command_to_commit_ms", "commit_to_emit_ms"]) {
      expect(frame).not.toHaveProperty(name);
    }
    expect(telemetry.histogram).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent("louvorja-sse", { detail: { ...message,
      payload: { ...message.payload, selectionRevision: 3, delivery: { kind: "update", sentAt: 60_000 },
        snapshot: { ...message.payload.snapshot, revision: 3, slide: { lyric: "Stale" } } } } }));
    await nextTick();
    expect(wrapper.text()).toBe("Remote slide");

    window.dispatchEvent(new CustomEvent("louvorja-sse", { detail: {
      type: BROADCAST_TYPE.SLIDE_CHANGE,
      payload: { slide: { lyric: "Remote editor" }, slide_index: 0, total_slides: 1,
        _ts: 29_975, _command_ts: 29_955, _commit_ts: 29_965 },
    } }));
    await nextTick();
    for (let i = 0; i < 2; i++) {
      const callbacks = frames.splice(0);
      for (const callback of callbacks) callback(performance.now());
    }
    expect(wrapper.text()).toBe("Remote editor");
    expect(telemetry.track.mock.lastCall?.[1]).toMatchObject({
      clock_basis: "receiver", received_via: "sse", receive_to_frame_ms: 0,
    });
    expect(telemetry.track.mock.lastCall?.[1]).not.toHaveProperty("broadcast_to_frame_ms");
    expect(telemetry.histogram).not.toHaveBeenCalled();
  });
});
