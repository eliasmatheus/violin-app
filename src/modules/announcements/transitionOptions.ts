import { ModuleEnum } from "@/enums/ModuleEnum";
import { getModulePath } from "@/helpers/ModulePath";
import { KEYS } from "@/constants/UserDataKeys";

const ribbonPath = `${getModulePath(ModuleEnum.ANNOUNCEMENTS)}.ribbon`;

export interface TransitionOption {
  value: string;
  label: string;
}

export interface TransitionParamDef {
  key: string;
  def: string;
  values: readonly string[];
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

function opt(value: string, label: string): TransitionOption {
  return { value, label: `${ribbonPath}.${label}` };
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
    label: `${ribbonPath}.${label}`,
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

const A = KEYS.MODULES.ANNOUNCEMENTS.TRANSITION_OPTIONS;

/** Parâmetro de cada efeito — `none` não tem parâmetro. */
export const TRANSITION_PARAMS: Record<string, TransitionParamDef> = {
  fade: def(A.FADE_STYLE, "fade_style", OPTS.FADE, "simple"),
  slide: def(A.DIR, "trans_dir", OPTS.DIR, "auto"),
  zoom: def(A.ZOOM, "zoom_mode", OPTS.ZOOM, "out"),
  wipe: def(A.WIPE_DIR, "wipe_dir", OPTS.WIPE, "auto"),
  split: def(A.SPLIT_DIR, "split_dir", OPTS.SPLIT, "horizontal"),
  flip: def(A.FLIP_AXIS, "flip_axis", OPTS.DIR, "horizontal"),
  circle: def(A.CIRCLE_ORIGIN, "circle_origin", OPTS.ORIGIN, "center"),
};

/** Origem do zoom — folha separada, com select exclusivo no ribbon. */
export const ZOOM_ORIGIN_PARAM = def(A.ZOOM_ORIGIN, "zoom_origin", OPTS.ORIGIN, "center");

/** Curva de animação — folha única compartilhada por todos os efeitos. */
export const EASE_PARAM = def(A.EASE, "trans_ease", OPTS.EASE, "ease");

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

export function readTransitionParam(
  p: TransitionParamDef,
  raw: unknown,
): string {
  return typeof raw === "string" && p.values.includes(raw) ? raw : p.def;
}
