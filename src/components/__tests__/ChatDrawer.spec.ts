import { afterEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import type { VueWrapper } from "@vue/test-utils";
import { TooltipProvider } from "reka-ui";
import { mountUi } from "@/components/ui/__tests__/mountUi";

const mocks = vi.hoisted(() => ({
  messages: [] as {
    id: string;
    sender: string;
    deviceId?: string;
    platform?: string;
    text: string;
    timestamp: string;
  }[],
  isOpen: true,
}));

vi.mock("@/composables/useChat", async () => {
  const { ref } = await import("vue");
  const messages = ref(mocks.messages);
  const isOpen = ref(mocks.isOpen);
  return {
    useChat: () => ({
      messages,
      isOpen,
      isPinned: ref(false),
      autoOpenOnNew: ref(true),
      loadHistory: () => {},
      sendMessage: () => {},
      setOpen: (v: boolean) => {
        isOpen.value = v;
      },
      togglePin: () => {},
      setAutoOpen: () => {},
      clearHistory: () => {},
    }),
  };
});

import ChatDrawer from "@/components/ChatDrawer.vue";

const OPERATOR = {
  id: "m1",
  sender: "Operador",
  text: "Vamos começar o louvor",
  timestamp: "2026-09-29T10:00:00.000Z",
};

const REMOTE = {
  id: "m2",
  sender: "Ana",
  deviceId: "dev-1",
  platform: "android",
  text: "Áudio pronto",
  timestamp: "2026-09-29T10:01:00.000Z",
};

describe("ChatDrawer bolhas", () => {
  let wrapper: VueWrapper | null = null;

  function montar(): VueWrapper {
    // TooltipProvider mora no App.vue; sem ele o LjTooltip do header lança.
    wrapper = mountUi(
      { render: () => h(TooltipProvider, { delayDuration: 0 }, () => h(ChatDrawer)) },
      { attachTo: document.body },
    );
    return wrapper;
  }

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    mocks.messages.length = 0;
  });

  it("wraps each message in a bubble anchored by sender side", () => {
    mocks.messages.push(OPERATOR, REMOTE);
    const w = montar();

    const rows = w.findAll(".chat-drawer__msg");
    expect(rows).toHaveLength(2);
    expect(rows[0].classes()).toContain("chat-drawer__msg--operator");
    expect(rows[1].classes()).toContain("chat-drawer__msg--remote");
    expect(rows[0].find(".chat-drawer__bubble").exists()).toBe(true);
    expect(rows[1].find(".chat-drawer__bubble").exists()).toBe(true);
  });

  it("tones the operator bubble apart: sender, time and text inside each one", () => {
    mocks.messages.push(OPERATOR, REMOTE);
    const w = montar();

    const operator = w.find(".chat-drawer__msg--operator .chat-drawer__bubble");
    expect(operator.find(".chat-drawer__sender").text()).toBe("Operador");
    expect(operator.find(".chat-drawer__text").text()).toBe("Vamos começar o louvor");
    expect(operator.find(".chat-drawer__time").text()).toMatch(/\d{2}:\d{2}/);

    const remote = w.find(".chat-drawer__msg--remote .chat-drawer__bubble");
    expect(remote.find(".chat-drawer__sender").text()).toBe("Ana");
    expect(remote.find(".chat-drawer__text").text()).toBe("Áudio pronto");
  });

  it("keeps the platform icon only on messages from other devices", () => {
    mocks.messages.push(OPERATOR, REMOTE);
    const w = montar();

    expect(w.find(".chat-drawer__msg--operator .chat-drawer__platform-icon").exists()).toBe(false);
    expect(w.find(".chat-drawer__msg--remote .chat-drawer__platform-icon").exists()).toBe(true);
  });

  it("shows the empty state when there are no messages", () => {
    const w = montar();
    expect(w.find(".chat-drawer__empty").exists()).toBe(true);
    expect(w.findAll(".chat-drawer__msg")).toHaveLength(0);
  });
});
