import { computed } from "vue";
import type { ComputedRef, CSSProperties } from "vue";
import UserData from "@/helpers/UserData";
import {
  TRANSITION_TYPES,
  readTransitionParam,
  type TransitionContext,
  type TransitionParamDef,
  type TransitionType,
} from "@/config/Transitions";

/**
 * useTransitionStage — lê a configuração de transição do módulo em UserData e
 * devolve o nome da classe Vue Transition e as variáveis CSS da stage.
 *
 * Compartilhado pelas projeções (Anúncios, Arquivo/Retorno da Biblioteca de
 * Mídia). `isBackward` alimenta o modo automático de direção: quem navega
 * define a direção (volta = trás) e os vetores invertem junto.
 */
export function useTransitionStage(
  ctx: TransitionContext,
  options: { isBackward?: () => boolean } = {},
): {
  transitionType: ComputedRef<TransitionType>;
  transitionName: ComputedRef<string>;
  transitionDurationMs: ComputedRef<number>;
  stageStyle: ComputedRef<CSSProperties>;
} {
  const isBackward = options.isBackward ?? ((): boolean => false);

  const transitionType = computed<TransitionType>(() => {
    const v = UserData.get<string>(ctx.typeKey, "none");
    return typeof v === "string" && (TRANSITION_TYPES as readonly string[]).includes(v)
      ? (v as TransitionType)
      : "none";
  });

  /** Nome da classe Vue Transition — "lj-t-none" não tem CSS e troca na hora. */
  const transitionName = computed(() => `lj-t-${transitionType.value}`);

  const transitionDurationMs = computed(() => {
    const n = Number(UserData.get(ctx.durationKey, 500));
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10000) : 500;
  });

  function readParam(p: TransitionParamDef): string {
    return readTransitionParam(p, UserData.get<string>(p.key, p.def));
  }

  /** Vetores do Deslizar — `auto` inverte por navegação, `horizontal` sempre
   * entra pela direita, `vertical` inverte por baixo/cima. */
  function slideVectors(): { ex: string; ey: string; lx: string; ly: string } {
    const dir = readParam(ctx.params.slide);
    const bwd = isBackward();
    if (dir === "vertical")
      return { ex: "0%", ey: bwd ? "-100%" : "100%", lx: "0%", ly: bwd ? "100%" : "-100%" };
    if (dir === "horizontal") return { ex: "100%", ey: "0%", lx: "-100%", ly: "0%" };
    return { ex: bwd ? "-100%" : "100%", ey: "0%", lx: bwd ? "100%" : "-100%", ly: "0%" };
  }

  /** `auto` inverte por navegação; os lados fixos não invertem. */
  function wipeClip(): string {
    const dir = readParam(ctx.params.wipe);
    if (dir === "right") return "inset(0 0 0 100%)";
    if (dir === "top") return "inset(0 0 100% 0)";
    if (dir === "bottom") return "inset(100% 0 0 0)";
    if (dir === "left") return "inset(0 100% 0 0)";
    return isBackward() ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
  }

  function splitClip(): string {
    return readParam(ctx.params.split) === "vertical"
      ? "inset(50% 0 50% 0)"
      : "inset(0 50% 0 50%)";
  }

  function flipTransforms(): { enter: string; leave: string } {
    const axis = readParam(ctx.params.flip) === "vertical" ? "rotateX" : "rotateY";
    const sign = isBackward() ? -1 : 1;
    return { enter: `${axis}(${sign * 90}deg)`, leave: `${axis}(${sign * -90}deg)` };
  }

  function originPos(origin: string): string {
    switch (origin) {
      case "top":
        return "50% 0%";
      case "bottom":
        return "50% 100%";
      case "left":
        return "0% 50%";
      case "right":
        return "100% 50%";
      default:
        return "50% 50%";
    }
  }

  /** Variáveis lidas pelo CSS da stage — direção é variável (não classe) porque
   * o elemento saindo é um vnode antigo, com as classes congeladas no tempo do
   * render anterior; a stage é atualizada no mesmo tick e vale para os dois. */
  const stageStyle = computed(() => {
    const v = slideVectors();
    const wipe = wipeClip();
    const split = splitClip();
    const flip = flipTransforms();
    const fadeStyle = readParam(ctx.params.fade);
    const zoomMode = readParam(ctx.params.zoom);
    return {
      "--trans-dur": `${transitionDurationMs.value}ms`,
      "--trans-ease": readParam(ctx.easeParam),
      "--ent-x": v.ex,
      "--ent-y": v.ey,
      "--lv-x": v.lx,
      "--lv-y": v.ly,
      "--fade-blur": fadeStyle === "blur" ? "12px" : "0px",
      "--fade-delay": fadeStyle === "through_bg" ? `${transitionDurationMs.value}ms` : "0ms",
      "--fade-y": fadeStyle === "motion" ? "30px" : "0px",
      "--zoom-from": zoomMode === "in" ? "0.94" : "1.06",
      "--zoom-origin": originPos(readParam(ctx.zoomOriginParam)),
      "--wipe-enter": wipe,
      "--wipe-leave": wipe,
      "--split-enter": split,
      "--split-leave": split,
      "--circle-pos": originPos(readParam(ctx.params.circle)),
      "--flip-enter": flip.enter,
      "--flip-leave": flip.leave,
    } as CSSProperties;
  });

  return { transitionType, transitionName, transitionDurationMs, stageStyle };
}
