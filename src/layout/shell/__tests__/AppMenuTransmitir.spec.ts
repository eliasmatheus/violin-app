import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { ref } from "vue";
import { makeI18n } from "@/components/ui/__tests__/mountUi";
import { KEYS } from "@/constants/UserDataKeys";

const state = vi.hoisted(() => ({
  savedIp: "192.168.1.20",
  ips: ["192.168.1.10", "192.168.1.20"],
  set: vi.fn(),
}));

vi.mock("@/helpers/Platform", () => ({
  default: {
    isDesktop: true,
    httpServer: {
      status: async () => ({ running: true, port: 7171, token: "HOST1" }),
      localIps: async () => [...state.ips],
      hostname: async () => "host.local",
    },
    userStore: { read: async () => ({ httpServer: { port: 7070, useHostname: false } }) },
  },
}));
vi.mock("@/helpers/UserData", () => ({
  default: {
    get: (key: string, fallback: unknown) =>
      key === KEYS.OPTIONS.SELECTED_IP ? state.savedIp : fallback,
    set: (key: string, value: string) => {
      state.set(key, value);
      if (key === KEYS.OPTIONS.SELECTED_IP) state.savedIp = value;
    },
  },
}));
vi.mock("@/composables/useDisplays", () => ({
  useDisplays: () => ({
    displays: ref([]),
    getFeatureRole: async () => null,
    setFeatureRole: async () => {},
  }),
}));
vi.mock("@/composables/useDevices", () => ({
  useDevices: () => ({ devices: ref([]), pendingDevice: ref(null), loadDevices: async () => {} }),
}));
vi.mock("@/helpers/Projection", () => ({ open: async () => {} }));
vi.mock("@/helpers/Snackbar", () => ({ default: { success: vi.fn() } }));
vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
  },
}));

import AppMenuTransmitir from "../AppMenuTransmitir.vue";

beforeEach(() => {
  state.savedIp = "192.168.1.20";
  state.ips = ["192.168.1.10", "192.168.1.20"];
  state.set.mockClear();
});

async function mountTransmission() {
  const wrapper = shallowMount(AppMenuTransmitir, { global: { plugins: [makeI18n("pt")] } });
  await flushPromises();
  return wrapper;
}

describe("Transmissão — endereço escolhido", () => {
  it("restaura o IP salvo antes de carregar as interfaces e usa a porta efetiva", async () => {
    const wrapper = await mountTransmission();
    try {
      expect(state.savedIp).toBe("192.168.1.20");
      expect(state.set).not.toHaveBeenCalledWith(KEYS.OPTIONS.SELECTED_IP, "192.168.1.10");
      const urls = wrapper.findAll(".tx-url").map((node) => node.text());
      expect(urls).toHaveLength(7);
      expect(urls.every((url) => url.startsWith("http://192.168.1.20:7171/"))).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    ["sem IP salvo", "", ["192.168.1.10", "192.168.1.20"], "192.168.1.10"],
    ["IP salvo indisponível", "192.168.1.30", ["192.168.1.10", "192.168.1.20"], "192.168.1.10"],
    ["sem interface ativa", "192.168.1.20", [], "127.0.0.1"],
  ])("escolhe um endereço disponível quando %s", async (_label, saved, ips, expected) => {
    state.savedIp = saved;
    state.ips = ips;
    const wrapper = await mountTransmission();
    try {
      expect(state.savedIp).toBe(expected);
      expect(wrapper.find(".tx-url").text()).toContain(`http://${expected}:7171/`);
    } finally {
      wrapper.unmount();
    }
  });

  it("lembra uma nova escolha ao reabrir o painel", async () => {
    state.savedIp = "192.168.1.10";
    const wrapper = await mountTransmission();
    await wrapper.findComponent({ name: "LjSelect" }).vm.$emit("update:modelValue", "192.168.1.20");
    await flushPromises();
    expect(state.savedIp).toBe("192.168.1.20");
    wrapper.unmount();

    const reopened = await mountTransmission();
    try {
      expect(reopened.find(".tx-url").text()).toContain("http://192.168.1.20:7171/");
    } finally {
      reopened.unmount();
    }
  });
});
