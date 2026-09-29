import type { RibbonButton } from "@/types/Ribbon";

/**
 * Transições entre slides/mídia — vocabulário, parâmetros e botões da ribbon
 * compartilhados entre os módulos (Anúncios, Biblioteca de Mídia).
 *
 * Labels apontam para o namespace `transitions.*` do lang principal
 * (`src/lang/{pt,es}.json`); só as chaves de UserData são por módulo, cada um
 * configura suas transições de forma independente.
 */

export interface TransitionOption {
  value: string;
  label: string;
}

export interface TransitionParamDef {
  /** Chave de UserData do módulo. */
  key: string;
  def: string;
  values: readonly string[];
  /** Caminho i18n — `transitions.<chave>`. */
  label: string;
  options: readonly TransitionOption[];
}

export const TRANSITION_TYPES = [
  "none",
  "fade",
  "slide",
  "zoom",
  "wipe",
  "flip",
  "circle",
  "split",
] as const;

export type TransitionType = (typeof TRANSITION_TYPES)[number];

/** Grupos de chaves de UserData idênticos em cada módulo de transição. */
export interface TransitionKeyGroup {
  TRANSITION_TYPE: string;
  TRANSITION_DURATION: string;
  TRANSITION_OPTIONS: {
    ROOT: string;
    EASE: string;
    FADE_STYLE: string;
    DIR: string;
    ZOOM: string;
    ZOOM_ORIGIN: string;
    WIPE_DIR: string;
    SPLIT_DIR: string;
    FLIP_AXIS: string;
    CIRCLE_ORIGIN: string;
  };
}

export interface TransitionContext {
  typeKey: string;
  durationKey: string;
  /** Parâmetro de cada efeito — `none` não tem parâmetro. */
  params: Record<string, TransitionParamDef>;
  /** Curva de animação — folha única compartilhada por todos os efeitos. */
  easeParam: TransitionParamDef;
  /** Origem do zoom — folha separada, com select exclusivo no ribbon. */
  zoomOriginParam: TransitionParamDef;
}

function opt(value: string, label: string): TransitionOption {
  return { value, label: `transitions.${label}` };
}

function def(
  key: string,
  label: string,
  options: readonly TransitionOption[],
  fallback: string,
): TransitionParamDef {
  return {
    key,
    def: fallback,
    label: `transitions.${label}`,
    options,
    values: options.map((o) => o.value),
  };
}

const OPTS = {
  FADE: [
    opt("simple", "fade_simple"),
    opt("blur", "fade_blur"),
    opt("through_bg", "fade_through"),
    opt("motion", "fade_motion"),
  ],
  DIR: [
    opt("auto", "dir_auto"),
    opt("horizontal", "dir_horizontal"),
    opt("vertical", "dir_vertical"),
  ],
  ZOOM: [opt("in", "zoom_in"), opt("out", "zoom_out")],
  ORIGIN: [
    opt("center", "org_center"),
    opt("top", "org_top"),
    opt("bottom", "org_bottom"),
    opt("left", "org_left"),
    opt("right", "org_right"),
  ],
  WIPE: [
    opt("auto", "dir_auto"),
    opt("left", "wipe_left"),
    opt("right", "wipe_right"),
    opt("top", "wipe_top"),
    opt("bottom", "wipe_bottom"),
  ],
  SPLIT: [opt("horizontal", "split_h"), opt("vertical", "split_v")],
  EASE: [
    opt("linear", "ease_linear"),
    opt("ease", "ease_default"),
    opt("ease-in", "ease_in"),
    opt("ease-out", "ease_out"),
    opt("ease-in-out", "ease_inout"),
    opt("cubic-bezier(0.16, 1, 0.3, 1)", "ease_smooth"),
    opt("cubic-bezier(0.4, 0, 0.2, 1)", "ease_dynamic"),
  ],
} as const;

/** Monta o contexto de um módulo a partir do grupo de chaves dele. */
export function createTransitionContext(keys: TransitionKeyGroup): TransitionContext {
  const O = keys.TRANSITION_OPTIONS;
  return {
    typeKey: keys.TRANSITION_TYPE,
    durationKey: keys.TRANSITION_DURATION,
    params: {
      fade: def(O.FADE_STYLE, "fade_style", OPTS.FADE, "simple"),
      slide: def(O.DIR, "trans_dir", OPTS.DIR, "auto"),
      zoom: def(O.ZOOM, "zoom_mode", OPTS.ZOOM, "out"),
      wipe: def(O.WIPE_DIR, "wipe_dir", OPTS.WIPE, "auto"),
      split: def(O.SPLIT_DIR, "split_dir", OPTS.SPLIT, "horizontal"),
      flip: def(O.FLIP_AXIS, "flip_axis", OPTS.DIR, "horizontal"),
      circle: def(O.CIRCLE_ORIGIN, "circle_origin", OPTS.ORIGIN, "center"),
    },
    easeParam: def(O.EASE, "trans_ease", OPTS.EASE, "ease"),
    zoomOriginParam: def(O.ZOOM_ORIGIN, "zoom_origin", OPTS.ORIGIN, "center"),
  };
}

export const TRANSITION_TYPE_OPTIONS: readonly TransitionOption[] = [
  opt("none", "trans_none"),
  opt("fade", "trans_fade"),
  opt("slide", "trans_slide"),
  opt("zoom", "trans_zoom"),
  opt("wipe", "trans_wipe"),
  opt("flip", "trans_flip"),
  opt("circle", "trans_circle"),
  opt("split", "trans_split"),
];

/** Valida o valor lido de UserData; qualquer lixo cai no default. */
export function readTransitionParam(
  p: TransitionParamDef,
  raw: unknown,
): string {
  return typeof raw === "string" && p.values.includes(raw) ? raw : p.def;
}

/**
 * Grupo da ribbon com Efeito, Duração, Curva, um select por efeito
 * (`dependsOnOption` filtra na ribbon) e a origem do zoom — os ids são
 * prefixados por módulo para coexistirem na mesma aplicação.
 */
export function createTransitionButtons(
  moduleId: string,
  ctx: TransitionContext,
): RibbonButton[] {
  const paramButtons: RibbonButton[] = Object.entries(ctx.params).map(
    ([effect, p]) => ({
      id: `${moduleId}_param_${effect}`,
      label: p.label,
      type: "select",
      optionKey: p.key,
      defaultValue: p.def,
      options: p.options.map((o) => ({ ...o })),
      dependsOnOption: {
        path: ctx.typeKey,
        value: effect,
      },
    }),
  );
  return [
    {
      id: `${moduleId}_transition_type`,
      label: "transitions.trans_type",
      type: "select",
      optionKey: ctx.typeKey,
      defaultValue: "none",
      options: TRANSITION_TYPE_OPTIONS.map((o) => ({ ...o })),
    },
    {
      id: `${moduleId}_transition_duration`,
      label: "transitions.trans_duration",
      type: "slider",
      optionKey: ctx.durationKey,
      defaultValue: 500,
      min: 100,
      max: 2000,
      step: 100,
    },
    {
      id: `${moduleId}_transition_ease`,
      label: ctx.easeParam.label,
      type: "select",
      optionKey: ctx.easeParam.key,
      defaultValue: ctx.easeParam.def,
      options: ctx.easeParam.options.map((o) => ({ ...o })),
    },
    ...paramButtons,
    {
      id: `${moduleId}_transition_zoom_origin`,
      label: ctx.zoomOriginParam.label,
      type: "select",
      optionKey: ctx.zoomOriginParam.key,
      defaultValue: ctx.zoomOriginParam.def,
      options: ctx.zoomOriginParam.options.map((o) => ({ ...o })),
      dependsOnOption: {
        path: ctx.typeKey,
        value: "zoom",
      },
    },
  ];
}
