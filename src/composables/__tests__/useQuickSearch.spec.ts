import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, reactive, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { KEYS } from "@/constants/UserDataKeys";

// AppData de mentira, reativo, para os watchers do composable.
const state = reactive<Record<string, unknown>>({});
vi.mock("@/helpers/AppData", () => ({
  default: {
    get: (key: string, fallback?: unknown) => (key in state ? state[key] : fallback),
    set: (key: string, value: unknown) => (state[key] = value),
  },
}));

const { useQuickSearch } = await import("../useQuickSearch");

const Probe = defineComponent({
  props: { id: { type: String, default: "hymnal" } },
  setup(props) {
    const inputEl = ref<HTMLInputElement | null>(null);
    const field = ref({
      focus: () => inputEl.value?.focus(),
      select: () => {
        inputEl.value?.focus();
        inputEl.value?.select();
      },
      el: () => inputEl.value,
    });
    useQuickSearch({ moduleId: () => props.id, input: field });
    return () => h("div", [h("input", { ref: inputEl, value: "123", "data-search": "" })]);
  },
});

let wrapper: VueWrapper | null = null;
let other: HTMLInputElement | null = null;

/** O composable espera o próximo quadro para o v-show da aba aparecer. */
async function frame() {
  await nextTick();
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

function search(): HTMLInputElement {
  return wrapper!.element.querySelector("[data-search]") as HTMLInputElement;
}

beforeEach(() => {
  for (const k of Object.keys(state)) delete state[k];
  // jsdom não faz layout: offsetParent nulo faria o campo parecer escondido.
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  other?.remove();
  other = null;
});

describe("useQuickSearch — busca pronta para digitar", () => {
  it("clicou na aba do módulo: cursor na busca com o texto selecionado", async () => {
    state.active_module = "musics";
    wrapper = mount(Probe, { attachTo: document.body });
    await frame();
    expect(document.activeElement).not.toBe(search());

    state.active_module = "hymnal";
    await frame();
    expect(document.activeElement).toBe(search());
    expect([search().selectionStart, search().selectionEnd]).toEqual([0, 3]);
  });

  it("o player fechou: volta selecionado para o próximo número", async () => {
    state.active_module = "hymnal";
    state[KEYS.MODULES.MEDIA.SHOW] = true;
    wrapper = mount(Probe, { attachTo: document.body });
    await frame();
    search().blur();

    state[KEYS.MODULES.MEDIA.SHOW] = false;
    await frame();
    expect(document.activeElement).toBe(search());
    expect(search().selectionEnd).toBe(3);
  });

  it("não rouba o foco de quem digita em outro campo", async () => {
    state.active_module = "liturgy";
    other = document.createElement("input");
    document.body.appendChild(other);
    wrapper = mount(Probe, { attachTo: document.body });
    other.focus();

    state.active_module = "hymnal";
    await frame();
    expect(document.activeElement).toBe(other);
  });

  it("aba de outro módulo não mexe nesta busca", async () => {
    state.active_module = "bible";
    wrapper = mount(Probe, { attachTo: document.body });
    await frame();
    expect(document.activeElement).not.toBe(search());
  });
});
