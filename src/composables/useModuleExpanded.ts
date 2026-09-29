import { computed, type ComputedRef } from "vue";
import $appdata from "@/helpers/AppData";
import $userdata from "@/helpers/UserData";
import { KEYS } from "@/constants/UserDataKeys";
import { ModuleEnum } from "@/enums/ModuleEnum";

/**
 * Módulos que podem ocupar a área do ribbon e das abas de módulo.
 *
 * A preferência é por módulo e fica gravada: quem opera expandido volta
 * expandido no próximo culto. O shell só a aplica enquanto a aba do módulo
 * estiver ativa — trocar de aba devolve o ribbon sem apagar a escolha.
 */
const EXPANDED_KEYS: Readonly<Record<string, string>> = Object.freeze({
  [ModuleEnum.PRESENTATION_MODE]: KEYS.MODULES.PRESENTATION_MODE.EXPANDED,
});

export function isModuleExpandable(moduleId: string | null | undefined): boolean {
  return !!moduleId && moduleId in EXPANDED_KEYS;
}

export function isModuleExpanded(moduleId: string | null | undefined): boolean {
  if (!moduleId || !isModuleExpandable(moduleId)) return false;
  return $userdata.get<boolean>(EXPANDED_KEYS[moduleId], false) === true;
}

export function setModuleExpanded(moduleId: string, value: boolean): void {
  if (!isModuleExpandable(moduleId)) return;
  $userdata.set(EXPANDED_KEYS[moduleId], value);
}

export function toggleModuleExpanded(moduleId: string): void {
  setModuleExpanded(moduleId, !isModuleExpanded(moduleId));
}

/** Estado que o shell consulta: a aba ativa pediu para esconder o ribbon? */
export function useShellExpanded(): {
  activeModule: ComputedRef<string | null>;
  isExpanded: ComputedRef<boolean>;
} {
  const activeModule = computed(() => $appdata.get<string | null>("active_module", null));
  const isExpanded = computed(() => isModuleExpanded(activeModule.value));
  return { activeModule, isExpanded };
}
