import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";

// AppData de mentira, reativo: o Alert lê e grava `alert.*` nele.
const state = reactive<Record<string, unknown>>({});
function get(path: string) {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], state);
}
function set(path: string, value: unknown) {
  const keys = path.split(".");
  let o = state as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
  o[keys.at(-1)!] = value;
}
vi.mock("@/helpers/AppData", () => ({ default: { get, set } }));

const Alert = (await import("../Alert.vue")).default;
const Hotkeys = (await import("@/helpers/Hotkeys")).default;

let wrapper: VueWrapper | null = null;

function abrirPergunta() {
  state.alert = {
    show: true,
    title: "Deseja fechar este slide?",
    translate: false,
    buttons: [
      { text: "alert.no", color: "error", value: "no" },
      { text: "alert.yes", color: "info", value: "yes" },
    ],
  };
}

function tecla(key: string) {
  const alvo = (document.activeElement as HTMLElement) ?? document.body;
  alvo.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

beforeEach(() => {
  for (const k of Object.keys(state)) delete state[k];
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  Hotkeys.destroy();
});

async function montar() {
  // Como no app: o Alert já está montado e a pergunta abre depois.
  state.alert = { show: false };
  wrapper = mount(Alert, {
    attachTo: document.body,
    global: { mocks: { $t: (k: string) => k }, stubs: { Transition: false } },
  });
  abrirPergunta();
  await nextTick();
  await nextTick();
  await nextTick();
}

describe("Alert — pergunta pelo teclado", () => {
  it("Esc e depois Enter: confirma o Sim", async () => {
    await montar();
    tecla("Enter");
    expect(get("alert.value")).toBe("yes");
    expect(get("alert.show")).toBe(false);
  });

  it("as setas escolhem o botão e o Enter confirma o escolhido", async () => {
    await montar();
    tecla("ArrowLeft"); // de nada escolhido, a seta para a esquerda vai no último
    tecla("ArrowLeft"); // e de novo, no "Não"
    expect((document.activeElement as HTMLElement).textContent?.trim()).toBe("alert.no");
    tecla("Enter");
    expect(get("alert.value")).toBe("no");
  });

  it("Esc na pergunta fica com o Não", async () => {
    await montar();
    tecla("Escape");
    expect(get("alert.value")).toBe("no");
  });

  it("com a pergunta aberta, a seta não passa o slide por baixo", async () => {
    Hotkeys.init();
    const passarSlide = vi.fn();
    Hotkeys.register("ArrowRight", passarSlide, { context: "media", allowInForm: true });
    await montar();
    tecla("ArrowRight");
    expect(passarSlide).not.toHaveBeenCalled();
    Hotkeys.unregister("ArrowRight", passarSlide);
  });
});
