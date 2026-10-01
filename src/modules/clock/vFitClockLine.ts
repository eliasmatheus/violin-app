import type { Directive } from "vue";

type FitValue = string | number | null | undefined;

interface FitState {
  value: FitValue;
  refit: () => void;
  observer: ResizeObserver | null;
  active: boolean;
}

const states = new WeakMap<HTMLElement, FitState>();

function fit(el: HTMLElement, value: FitValue): void {
  const preferred = Number.parseFloat(String(value));
  if (!Number.isFinite(preferred) || preferred <= 0) return;

  // Recomeça do tamanho escolhido pelo operador. O ajuste só atua quando a
  // linha não cabe, inclusive depois de uma troca de fonte ou de janela.
  el.style.fontSize = `${preferred}px`;
  const available = el.clientWidth - 2;
  if (available <= 0 || !el.textContent) return;

  const range = document.createRange();
  range.selectNodeContents(el);
  const width = range.getBoundingClientRect().width;
  if (width > available) {
    el.style.fontSize = `${Math.max(1, (preferred * available) / width)}px`;
  }
}

/** Reduz apenas a linha que excede a largura; nunca quebra nem corta texto. */
export const vFitClockLine: Directive<HTMLElement, FitValue> = {
  mounted(el, binding) {
    const state: FitState = {
      value: binding.value,
      refit: () => {},
      observer: null,
      active: true,
    };
    state.refit = () => fit(el, state.value);
    states.set(el, state);
    state.refit();

    if (typeof ResizeObserver !== "undefined") {
      let lastWidth = 0;
      state.observer = new ResizeObserver(([entry]) => {
        const width = entry.contentRect.width;
        if (Math.abs(width - lastWidth) < 0.5) return;
        lastWidth = width;
        state.refit();
      });
      state.observer.observe(el);
    }

    document.fonts?.addEventListener?.("loadingdone", state.refit);
    void document.fonts?.ready?.then(() => {
      if (state.active) state.refit();
    });
  },
  updated(el, binding) {
    const state = states.get(el);
    if (!state) return;
    state.value = binding.value;
    state.refit();
  },
  unmounted(el) {
    const state = states.get(el);
    if (!state) return;
    state.active = false;
    state.observer?.disconnect();
    document.fonts?.removeEventListener?.("loadingdone", state.refit);
    states.delete(el);
  },
};
