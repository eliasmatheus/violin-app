import type { Module } from "@/types/Module"
import type { RibbonButton, RibbonPage } from "@/types/Ribbon"
import { ModuleCategoryEnum } from "@/enums/ModuleCategoryEnum"
import { ModuleGroupEnum } from "@/enums/ModuleGroupEnum"
import { ICONS } from "@/config/Icons"
import { ModuleEnum } from "@/enums/ModuleEnum"
import { getModulePath } from "@/helpers/ModulePath"
import { KEYS } from "@/constants/UserDataKeys"
import {
  EASE_PARAM,
  TRANSITION_PARAMS,
  TRANSITION_TYPE_OPTIONS,
  ZOOM_ORIGIN_PARAM,
} from "./transitionOptions"

const moduleId = ModuleEnum.ANNOUNCEMENTS;
const modulePath = getModulePath(moduleId);
const moduleCtxId = "ctx_" + moduleId;

/** Um select por efeito — cada um aparece só quando `TRANSITION_TYPE`
 * corresponde ao seu `dependsOnOption`, então na ribbon só o ativo renderiza. */
const paramButtons: RibbonButton[] = Object.entries(TRANSITION_PARAMS).map(
  ([effect, p]) => ({
    id: `${moduleId}_param_${effect}`,
    label: p.label,
    type: "select",
    optionKey: p.key,
    defaultValue: p.def,
    options: p.options.map((o) => ({ ...o })),
    dependsOnOption: {
      path: KEYS.MODULES.ANNOUNCEMENTS.TRANSITION_TYPE,
      value: effect,
    },
  }),
);

export const module: Module = {
  id: moduleId,
  title: `${modulePath}.title`,
  name: "Anúncios",
  description: `${modulePath}.description`,
  icon: ICONS.MODULES.ANNOUNCEMENTS,
  color: "#f39c12",
  showInMainMenu: true,
  category: ModuleCategoryEnum.WORSHIP,
  group: ModuleGroupEnum.CHURCH,
  order: 1,
  dependencies: [],
  customization: {},
}

export const contextualPages: RibbonPage[] = [
  {
    id: moduleCtxId,
    title: `${modulePath}.ribbon.title_ctx`,
    contextual: true,
    activeOnModules: [moduleId],
    defaultModule: null,
    groups: [
      {
        id: moduleCtxId + "_transition",
        title: `${modulePath}.ribbon.transitions_group`,
        buttons: [
          {
            id: `${moduleId}_transition_type`,
            label: `${modulePath}.ribbon.trans_type`,
            type: "select",
            optionKey: KEYS.MODULES.ANNOUNCEMENTS.TRANSITION_TYPE,
            defaultValue: "none",
            options: TRANSITION_TYPE_OPTIONS.map((o) => ({ ...o })),
          },
          {
            id: `${moduleId}_transition_duration`,
            label: `${modulePath}.ribbon.trans_duration`,
            type: "slider",
            optionKey: KEYS.MODULES.ANNOUNCEMENTS.TRANSITION_DURATION,
            defaultValue: 500,
            min: 100,
            max: 2000,
            step: 100,
          },
          {
            id: `${moduleId}_transition_ease`,
            label: `${modulePath}.ribbon.trans_ease`,
            type: "select",
            optionKey: EASE_PARAM.key,
            defaultValue: EASE_PARAM.def,
            options: EASE_PARAM.options.map((o) => ({ ...o })),
          },
          ...paramButtons,
          {
            id: `${moduleId}_transition_zoom_origin`,
            label: `${modulePath}.ribbon.zoom_origin`,
            type: "select",
            optionKey: ZOOM_ORIGIN_PARAM.key,
            defaultValue: ZOOM_ORIGIN_PARAM.def,
            options: ZOOM_ORIGIN_PARAM.options.map((o) => ({ ...o })),
            dependsOnOption: {
              path: KEYS.MODULES.ANNOUNCEMENTS.TRANSITION_TYPE,
              value: "zoom",
            },
          },
        ],
      },
    ],
  },
]
