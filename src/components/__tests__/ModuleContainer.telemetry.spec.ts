import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, KeepAlive, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { makeI18n } from "@/components/ui/__tests__/mountUi";
import AppData from "@/helpers/AppData";
import Modules from "@/helpers/Modules";
import ModuleContainer from "../ModuleContainer.vue";

const telemetry = vi.hoisted(() => ({ pending: new Set<string>(), completed: vi.fn() }));
vi.mock("@/helpers/Telemetry", () => ({
  default: {
    markStart: (name: string, key: string) => telemetry.pending.add(`${name}:${key}`),
    markEnd: (name: string, key: string, properties: unknown) => {
      if (telemetry.pending.delete(`${name}:${key}`)) telemetry.completed(properties);
    },
    markCancel: (name: string, key: string) => telemetry.pending.delete(`${name}:${key}`),
    track: vi.fn(), histogram: vi.fn(),
  },
}));
vi.mock("@/helpers/UserData", () => ({ default: { get: () => [], set: vi.fn() } }));
vi.mock("@/helpers/Dev", () => ({ default: { write: vi.fn() } }));

describe("ModuleContainer opening measurements", () => {
  let wrapper: VueWrapper | null;
  beforeEach(() => {
    setActivePinia(createPinia());
    AppData.set("modules.testmod", { id: "testmod", show: false });
    telemetry.pending.clear();
    telemetry.completed.mockClear();
    wrapper = null;
  });
  afterEach(() => wrapper?.unmount());

  it("ends reopening at KeepAlive activation without remounting or leaving a pending operation", async () => {
    const shell = defineComponent({
      setup() {
        return () => h(KeepAlive, null, {
          default: () => AppData.get("modules.testmod.show") === true &&
            AppData.get("active_module") === "testmod"
            ? h(ModuleContainer, { manifest: { id: "testmod", name: "Test" }, title: "Test" })
            : null,
        });
      },
    });
    wrapper = mount(shell, { global: { plugins: [makeI18n("pt")] } });
    Modules.open("testmod");
    await nextTick();
    const mountedUid = wrapper.findComponent(ModuleContainer).vm.$.uid;
    expect(telemetry.pending.size).toBe(0);
    expect(telemetry.completed).toHaveBeenCalledTimes(1);

    Modules.close("testmod");
    await nextTick();
    Modules.open("testmod");
    expect(telemetry.pending.has("module.open:testmod")).toBe(true);
    await nextTick();
    expect(wrapper.findComponent(ModuleContainer).vm.$.uid).toBe(mountedUid);
    expect(telemetry.pending.size).toBe(0);
    expect(telemetry.completed).toHaveBeenCalledTimes(2);
    expect(telemetry.completed.mock.calls[1][0]).toMatchObject({ completion: "activated" });
  });

  it("discards an opening closed before mounting without reporting a successful load", () => {
    Modules.open("testmod");
    expect(telemetry.pending.has("module.open:testmod")).toBe(true);
    Modules.close("testmod");
    expect(telemetry.pending.size).toBe(0);
    expect(telemetry.completed).not.toHaveBeenCalled();
  });
});
