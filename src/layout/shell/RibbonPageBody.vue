<template>
  <div
    :id="panelId || undefined"
    ref="corpoRibbon"
    class="ribbon-body"
    :class="bodyClass"
    role="tabpanel"
    tabindex="0"
    :aria-labelledby="ariaLabelledby || undefined"
    @wheel="rolarComRoda"
    @scroll="medirSobra"
  >
    <RibbonGroupComponent
      v-for="group in effectiveGroups"
      :key="`${pageKey}:${group.id}`"
      :title="$t(group.title)"
    >
      <template v-if="group.customCategory">
        <component :is="group.customCategory" v-bind="getCustomComponentProps(group)" />
      </template>
      <template v-else>
        <div v-if="largeButtons(group).length" class="ribbon-group-track ribbon-group-track--large">
          <template v-for="btn in largeButtons(group)" :key="`${pageKey}:${group.id}:${btn.id}`">
            <div class="ribbon-group-item ribbon-group-item--full">
              <component
                :is="btn.customButton"
                v-if="btn.customButton"
                v-bind="getCustomComponentProps(group, btn)"
              />
              <RibbonScreenButton
                v-else-if="btn.type === 'screen'"
                :feature="btn.feature"
                :route="btn.route"
                :icon-color="resolveBtnColor(btn)"
                :label="$t(btn.label)"
                :size="btn.size || 'large'"
                :icon-only="buttonIconOnly"
                :icon-size="largeIconSize"
                :testid="`ribbon-btn-${btn.id}`"
              />
              <RibbonButtonComponent
                v-else
                v-show="isDependencyMet(btn)"
                :icon="resolveBtnIcon(btn)"
                :icon-color="resolveBtnColor(btn)"
                :label="$t(resolveBtnLabel(btn))"
                :size="btn.size || 'large'"
                :active="isButtonActive(btn)"
                :disabled="btn.disabled"
                :icon-only="buttonIconOnly"
                :icon-size="largeIconSize"
                :testid="`ribbon-btn-${btn.id}`"
                @click="executeButton(btn)"
                @pointerenter="onButtonIntent(btn)"
                @focus="onButtonIntent(btn)"
              />
            </div>
          </template>
        </div>

        <div
          v-if="compactButtons(group).length"
          class="ribbon-group-track"
          :class="getCompactTrackClass()"
        >
          <template v-for="btn in compactButtons(group)" :key="`${pageKey}:${group.id}:${btn.id}`">
            <div
              class="ribbon-group-item ribbon-group-item--compact"
              :class="getRibbonItemClass(btn)"
            >
              <component
                :is="btn.customButton"
                v-if="btn.customButton"
                v-bind="getCustomComponentProps(group, btn)"
              />
              <div v-else-if="btn.type === 'action_input'" class="ribbon-action-input">
                <label v-if="btn.inputType === 'time'" class="ribbon-field-label">
                  {{ $t(btn.label) }}
                </label>
                <input
                  v-model="inputValues[btn.id]"
                  :type="btn.inputType || 'text'"
                  class="ribbon-action-input__field"
                  :style="btn.style"
                  :placeholder="$t(btn.placeholder || '')"
                  @keydown.enter.prevent="executeInputAction(btn)"
                  @change="btn.inputType === 'time' && executeInputAction(btn)"
                />
                <RibbonButtonComponent
                  v-if="btn.inputType !== 'time'"
                  :icon="btn.icon || ''"
                  :icon-color="resolveBtnColor(btn)"
                  :label="$t(btn.label)"
                  size="medium"
                  :style="btn.style"
                  :icon-only="buttonIconOnly"
                  :icon-size="compactIconSize"
                  :testid="`ribbon-btn-${btn.id}`"
                  @click="executeInputAction(btn)"
                />
              </div>
              <div
                v-else-if="btn.type === 'select'"
                class="ribbon-field-wrap"
                :data-testid="`ribbon-btn-${btn.id}`"
              >
                <label class="ribbon-field-label">{{ $t(btn.label) }}</label>
                <select
                  class="ribbon-field-select"
                  :value="getSelectValue(btn)"
                  @change="setSelectValue(btn, ($event.target as HTMLSelectElement)?.value)"
                >
                  <option v-for="opt in btn.options || []" :key="opt.value" :value="opt.value">
                    {{ $t(opt.label) }}
                  </option>
                  <option
                    v-for="opt in btn.dynamicOptions
                      ? dynamicSelectOptions[btn.dynamicOptions]
                      : []"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                  <template v-if="btn.feature">
                    <option value="">{{ $t("options.slides.same_window") }}</option>
                    <option v-for="r in roleOptions" :key="r.role" :value="r.role">
                      {{ r.label }}
                    </option>
                  </template>
                </select>
              </div>
              <div
                v-else-if="btn.type === 'slider'"
                v-show="isDependencyMet(btn)"
                class="ribbon-field-wrap"
                :data-testid="`ribbon-btn-${btn.id}`"
              >
                <label class="ribbon-field-label">{{ $t(btn.label) }}</label>
                <div class="ribbon-slider-row">
                  <LjSlider
                    class="ribbon-slider"
                    :model-value="Number(getSelectValue(btn))"
                    :min="btn.min ?? 0"
                    :max="btn.max ?? 2000"
                    :step="btn.step ?? 100"
                    :aria-label="$t(btn.label)"
                    @update:model-value="setSelectValue(btn, $event)"
                  />
                  <span class="ribbon-slider-value">{{ getSelectValue(btn) }}ms</span>
                </div>
              </div>
              <div
                v-else-if="btn.type === 'number'"
                v-show="isDependencyMet(btn)"
                class="ribbon-field-wrap"
                :data-testid="`ribbon-btn-${btn.id}`"
              >
                <label class="ribbon-field-label">{{ $t(btn.label) }}</label>
                <input
                  class="ribbon-field-number"
                  type="number"
                  :min="btn.min"
                  :max="btn.max"
                  :step="btn.step ?? 1"
                  :value="getSelectValue(btn)"
                  @change="setSelectValue(btn, ($event.target as HTMLSelectElement)?.value)"
                />
              </div>
              <!-- Faixa Violin: checkbox/switch viram botão-toggle só-ícone —
                   o texto vive no tooltip (title) e o estado no fundo ativo. -->
              <RibbonButtonComponent
                v-else-if="isStrip && (btn.type === 'checkbox' || btn.type === 'switch')"
                :icon="toggleIcon(btn)"
                :label="$t(resolveBtnLabel(btn))"
                size="small"
                :active="getCheckValue(btn)"
                :icon-only="true"
                :icon-size="16"
                :icon-color="btn.color || undefined"
                :testid="`ribbon-btn-${btn.id}`"
                @click="setCheckValue(btn, !getCheckValue(btn))"
              />
              <label v-else-if="btn.type === 'checkbox'" class="ribbon-field-checkbox">
                <input
                  type="checkbox"
                  :checked="getCheckValue(btn)"
                  @change="setCheckValue(btn, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ $t(btn.label) }}</span>
              </label>
              <div
                v-else-if="btn.type === 'switch'"
                class="ribbon-switch"
                :data-testid="`ribbon-btn-${btn.id}`"
              >
                <LjSwitch
                  class="ribbon-field-switch"
                  :model-value="getCheckValue(btn)"
                  :label="$t(btn.label)"
                  @update:model-value="setCheckValue(btn, $event)"
                />
              </div>
              <RibbonButtonComponent
                v-else
                v-show="isDependencyMet(btn)"
                :icon="resolveBtnIcon(btn)"
                :icon-color="resolveBtnColor(btn)"
                :label="$t(resolveBtnLabel(btn))"
                :size="btn.size || 'small'"
                :active="isButtonActive(btn)"
                :disabled="btn.disabled"
                :icon-only="buttonIconOnly"
                :icon-size="compactIconSize"
                :testid="`ribbon-btn-${btn.id}`"
                @click="executeButton(btn)"
              />
            </div>
          </template>
        </div>
      </template>
    </RibbonGroupComponent>
    <div v-if="effectiveGroups.length === 0" class="ribbon-empty">
      {{ $t("shell.empty_ribbon_page") }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Corpo da ribbon — o renderizador de grupos compartilhado.
 *
 * Extraído de RibbonBar.vue para servir duas superfícies com a mesma
 * semântica de botões:
 *
 *   - `variant="ribbon"` — o corpo da ribbon (páginas de lançamento de
 *     módulos; em Violin tudo aqui é só-ícone);
 *   - `variant="strip"`  — a faixa contextual no topo do módulo (estilo
 *     Violin): botões só-ícone, toggles em ícone, grid de 2 linhas e altura
 *     flexível limitada a 70px.
 *
 * Toda a lógica de comando (ações, broadcast, papéis de monitor, opções
 * dinâmicas) mora aqui: a faixa contextual precisa responder exatamente
 * como a ribbon respondia, ou os módulos enxergariam dois caminhos para a
 * mesma ação.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type ComputedRef,
} from "vue";
import { useI18n } from "vue-i18n";
import RibbonScreenButton from "@/layout/shell/RibbonScreenButton.vue";
import RibbonButtonComponent from "@/layout/shell/RibbonButtonComponent.vue";
import RibbonGroupComponent from "@/layout/shell/RibbonGroupComponent.vue";
import { LjSlider, LjSwitch } from "@/components/ui";
import { useShell } from "@/composables/useShell";
import { DISPLAY_ROLES, useDisplays } from "@/composables/useDisplays";
import { useRibbonStore } from "@/stores/ribbonStore";
import { useUiStyle } from "@/composables/useUiStyle";
import Platform from "@/helpers/Platform";
import $appdata from "@/helpers/AppData";
import $userdata from "@/helpers/UserData";
import $modules from "@/helpers/Modules";
import $alert from "@/helpers/Alert";
import $database from "@/helpers/Database";
import Broadcast from "@/helpers/Broadcast";
import { BROADCAST_TYPE } from "@/helpers/BroadcastTypes";
import { getRibbonModules, isModuleVisible } from "@/config/modules";
import { KEYS } from "@/constants/UserDataKeys";
import { COLORS } from "@constants/Colors";
import { ICONS } from "@/config/Icons";
import { THEMES } from "@/config/Theme";
import type { RibbonButton, RibbonGroup, RibbonPage } from "@/types/Ribbon";
import { ensureContrastOnDark } from "@/helpers/ColorContrast";
import { prefetchModule } from "@/helpers/ModulePrefetch";

const props = withDefaults(
  defineProps<{
    /** Grupos da página a renderizar. */
    groups?: RibbonGroup[];
    /** Chave de identidade dos itens (troca a chave e recria o estado). */
    pageKey?: string;
    /** Id da página — resolve o módulo de grupos/botões sem depender da store. */
    pageId?: string;
    /** Tinta de fundo da página contextual. */
    contextual?: boolean;
    /** Onde este corpo vive: ribbon principal ou faixa contextual Violin. */
    variant?: "ribbon" | "strip";
    /** `id` do tabpanel (a ribbon usa #ribbon-tabpanel). */
    panelId?: string;
    ariaLabelledby?: string;
  }>(),
  {
    groups: () => [],
    pageKey: "",
    pageId: "",
    contextual: false,
    variant: "ribbon",
    panelId: "",
    ariaLabelledby: "",
  }
);

const { t } = useI18n();
const shell = useShell();
const ribbonStore = useRibbonStore();
const { isViolin } = useUiStyle();

const isStrip = computed(() => props.variant === "strip");

/** Sem rótulo visível: faixa Violin inteira e, na ribbon, o modo Violin. */
const buttonIconOnly = computed(() => isStrip.value || isViolin.value);
/** Ícone dos botões grandes: 32 clássico · 10 ribbon Violin · 24 faixa. */
const largeIconSize = computed<number | undefined>(() => {
  if (isStrip.value) return 24;
  if (isViolin.value) return 10;
  return undefined;
});
/** Ícone dos itens compactos: 16 clássico · 10 ribbon Violin · 16 faixa. */
const compactIconSize = computed<number | undefined>(() => {
  if (isStrip.value) return 16;
  if (isViolin.value) return 10;
  return undefined;
});

const pages: RibbonPage[] = getRibbonModules;
const inputValues = reactive<Record<string, string>>({});

const { getFeatureRole, setFeatureRole } = useDisplays();

/** Papel de cada botão da ribbon. Carregado sob demanda (passa pelo IPC). */
const featureRoles = ref<Record<string, string>>({});

/** Papéis de monitor oferecidos nos selects de projeção. */
const roleOptions = computed(() =>
  DISPLAY_ROLES.map((role) => ({ role, label: t(`options.monitors.roles.${role}`) }))
);

interface DynamicOption {
  value: string;
  label: string;
}
const dynamicSelectOptions = reactive<Record<string, DynamicOption[]>>({});

interface BibleVersion {
  id_bible_version: string;
  abbreviation: string;
  name: string;
}

async function loadDynamicOptions(): Promise<void> {
  const [versionData, bookData] = await Promise.all([
    $database.get<BibleVersion[]>("pt_bible_version", { silent: true }),
    $database.get<unknown[]>("pt_bible_book", { silent: true }),
  ]);
  if (versionData?.length) {
    dynamicSelectOptions.version = versionData.map((v) => ({
      value: v.id_bible_version,
      label: `${v.abbreviation} - ${v.name}`,
    }));
  }
  if (bookData?.length) {
    dynamicSelectOptions.books = bookData as DynamicOption[];
  }
}

let dynamicOptionsPromise: Promise<void> | null = null;

function ensureDynamicOptions(): void {
  if (dynamicOptionsPromise) return;
  dynamicOptionsPromise = loadDynamicOptions().catch((error) => {
    dynamicOptionsPromise = null;
    console.warn("[RibbonPageBody] opções dinâmicas indisponíveis:", error);
  });
}

function getModuleIdForGroup(group: RibbonGroup): string | null {
  if (group.modules?.length) return group.modules[0];
  const page = pages.find((p: RibbonPage) => p.id === props.pageId);
  if (page?.activeOnModules?.length) return page.activeOnModules[0];
  return page?.defaultModule || null;
}

function getCustomComponentProps(
  group: RibbonGroup,
  btn?: RibbonButton
): { module: string | null; config: RibbonGroup | RibbonButton } {
  return {
    module: getModuleIdForGroup(group),
    config: btn || group,
  };
}

function getSelectValue(btn: RibbonButton): string | number {
  if (btn.optionKey) return $userdata.get(btn.optionKey, btn.defaultValue ?? "") as string;
  if (!btn.feature) return "";

  const feature = btn.feature;
  if (featureRoles.value[feature] === undefined) {
    featureRoles.value[feature] = "";
    getFeatureRole(feature).then((role) => {
      featureRoles.value = { ...featureRoles.value, [feature]: role ?? "" };
    });
  }
  return featureRoles.value[feature];
}

function setSelectValue(btn: RibbonButton, val: string | number): void {
  if (btn.optionKey) {
    $userdata.set(btn.optionKey, val);
    return;
  }
  if (!btn.feature) return;
  const role = String(val);
  featureRoles.value = { ...featureRoles.value, [btn.feature]: role };
  setFeatureRole(btn.feature, role || null);
}

function getCheckValue(btn: RibbonButton): boolean {
  if (!btn.optionKey) return false;
  // Fallback para o defaultValue declarado (ex: clock show_date default true)
  const v = $userdata.get<boolean | null>(btn.optionKey, null);
  if (v === null) return btn.defaultValue === true;
  return v;
}

function setCheckValue(btn: RibbonButton, checked: boolean | null): void {
  if (!btn.optionKey) return;
  $userdata.set(btn.optionKey, checked ?? false);
  if (btn.broadcastOnToggle) {
    Broadcast.send(btn.broadcastOnToggle, {});
  }
}

/** Ícone do toggle só-ícone da faixa: preenchido quando ligado. */
function toggleIcon(btn: RibbonButton): string {
  return getCheckValue(btn) ? ICONS.UI.CHECKED : ICONS.ACTIONS.UNCHECKED;
}

function isDependencyMet(btn: RibbonButton): boolean {
  if (btn.dependsOnOption) {
    const val = $userdata.get(btn.dependsOnOption.path, "") as string;
    return val.toString() === btn.dependsOnOption.value;
  }
  if (!btn.dependsOn) return true;
  const group = effectiveGroups.value?.find((g) => g.buttons?.some((b) => b.id === btn.dependsOn));
  const depBtn = group?.buttons?.find((b) => b.id === btn.dependsOn);
  if (!depBtn || depBtn.type !== "checkbox" || !depBtn.optionKey) return true;
  return $userdata.get<boolean>(depBtn.optionKey, false) === true;
}

function executeInputAction(btn: RibbonButton): void {
  const val = inputValues[btn.id]?.trim();
  if (!val) return;
  const m = btn.action?.match(
    /^(counter|draw|name_draw|clock|stopwatch|timer_worship|timer|message_board|online_videos|custom_online_videos|background_sound)_(.+)$/
  );
  if (m) {
    Broadcast.send(BROADCAST_TYPE.MODULE_RIBBON_ACTION, {
      module: m[1],
      action: m[2],
      payload: { url: val },
    });
  }
}

const openModuleIds: ComputedRef<string[]> = computed(() => {
  const mods = $appdata.get<Record<string, { show?: boolean }>>("modules") || {};
  return Object.keys(mods).filter((id) => mods[id]?.show === true);
});

const effectiveGroups: ComputedRef<RibbonGroup[]> = computed(() => {
  const groups = props.groups || [];
  // Remove botões de módulos ocultos via modules.<id>.show_in_main_menu
  // (ex: Hinário 1996 desativado na página de opções).
  return groups.map((g) => ({
    ...g,
    buttons: (g.buttons || []).filter((b) => !b.module || isModuleVisible(b.module)),
  }));
});

// As opções dinâmicas só aparecem em páginas contextuais. Não faça duas
// leituras de Bíblia durante o boot da tela inicial se o operador nunca abrir
// uma ribbon que as usa.
watch(
  () =>
    effectiveGroups.value.some((group) => group.buttons?.some((button) => button.dynamicOptions)),
  (needsDynamicOptions) => {
    if (needsDynamicOptions) ensureDynamicOptions();
  },
  { immediate: true }
);

// ---------------------------------------------------------------------------
// Rolagem quando os grupos não cabem (mouse vira rolagem horizontal + sombra
// de sobra na borda — ver comentário histórico no RibbonBar).
// ---------------------------------------------------------------------------
const corpoRibbon = ref<HTMLElement | null>(null);
const sobraNoInicio = ref(false);
const sobraNoFim = ref(false);

function medirSobra(): void {
  const el = corpoRibbon.value;
  if (!el) return;
  sobraNoInicio.value = el.scrollLeft > 1;
  sobraNoFim.value = el.scrollWidth - el.clientWidth - el.scrollLeft > 1;
}

function rolarComRoda(e: WheelEvent): void {
  const el = corpoRibbon.value;
  if (!el || el.scrollWidth <= el.clientWidth) return;
  // Trackpad com gesto horizontal já manda deltaX; aí o navegador faz melhor.
  if (e.deltaX !== 0) return;
  e.preventDefault();
  el.scrollLeft += e.deltaY;
}

let observador: ResizeObserver | null = null;
onMounted(() => {
  medirSobra();
  if (typeof ResizeObserver === "undefined" || !corpoRibbon.value) return;
  observador = new ResizeObserver(medirSobra);
  observador.observe(corpoRibbon.value);
});
onBeforeUnmount(() => observador?.disconnect());

watch(
  () => effectiveGroups.value.map((g) => g.id).join(","),
  () => nextTick(medirSobra)
);

const bodyClass = computed(() => ({
  "ribbon-body--ctx": props.contextual,
  "ribbon-body--strip": isStrip.value,
  "ribbon-body--sobra-inicio": sobraNoInicio.value,
  "ribbon-body--sobra-fim": sobraNoFim.value,
}));

function isButtonActive(btn: RibbonButton): boolean {
  if (!btn.module) return false;
  if (!openModuleIds.value.includes(btn.module)) return false;
  const lastBtn = $appdata.get<string | null>(`modules.${btn.module}.last_btn`);
  if (!lastBtn) return true;
  return lastBtn === btn.id;
}

interface LiturgyActionMap {
  [key: string]: string;
}
const LITURGY_ACTIONS: LiturgyActionMap = {
  lit_add_item: "add",
  lit_check_all: "check_all",
  lit_uncheck_all: "uncheck_all",
  lit_invert: "invert",
  lit_delete: "delete_selected",
  lit_copy: "copy",
  lit_clear: "clear_day",
  lit_mark_done: "toggle_mark_on_access",
  lit_show_notes: "toggle_show_notes",
  lit_lock: "toggle_lock",
  lit_save: "save",
  lit_load: "load",
  lit_export: "export",
  lit_import: "import",
  lit_manage: "manage",
};

const BIBLE_ACTIONS: LiturgyActionMap = {
  bible_clear: "clear",
  bible_prev_verse: "prev_verse",
  bible_next_verse: "next_verse",
  bible_format: "toggle_format",
  bible_restore: "restore",
  bible_project: "project",
  bible_settings: "settings",
};

const EDITOR_ACTIONS = new Set<string>([
  "editor_new",
  "editor_open",
  "editor_save",
  "editor_save_as",
  "editor_export",
  "editor_import_txt",
  "editor_project",
  "editor_new_slide",
  "editor_duplicate_slide",
  "editor_remove_slide",
  "editor_split_slide",
  "editor_merge_next",
  "editor_first",
  "editor_prev",
  "editor_next",
  "editor_last",
  "editor_audio_attach",
  "editor_audio_remove",
  "editor_play_pause",
  "editor_record_advance",
  "editor_record_start",
  "editor_record_retroactive",
  "editor_record_clear",
  "editor_view_full",
  "editor_view_4_3",
  "editor_view_16_9",
]);

function resolveBtnIcon(btn: RibbonButton): string {
  if (btn.stateBinding) {
    const val = $userdata.get(btn.stateBinding.watchPath);
    return val
      ? btn.stateBinding.iconOn || btn.icon || ""
      : btn.stateBinding.iconOff || btn.icon || "";
  }
  return btn.icon || "";
}

function resolveBtnColor(btn: RibbonButton): string | undefined {
  // Estilo de interface "Violin": todos os botões da ribbon usam a cor
  // primária do tema ativo (stateBinding também — estado indicado por ícone).
  // Em tema escuro os ícones ficam brancos para contraste na ribbon escura.
  const uiStyle = $userdata.get<string>(KEYS.OPTIONS.UI_STYLE, THEMES.CLASSIC);
  if (uiStyle === THEMES.VIOLIN) {
    const isDark = $appdata.get<boolean>(KEYS.SHELL.IS_DARK, false);
    return isDark ? "#FFFFFF" : COLORS.PRIMARY;
  }
  let color: string | undefined;
  if (btn.stateBinding) {
    const val = $userdata.get(btn.stateBinding.watchPath);
    color = val ? btn.stateBinding.colorOn || btn.color : btn.stateBinding.colorOff || btn.color;
  } else {
    color = btn.color;
  }
  // A paleta "classic" vem do Delphi, pensada pra fundo claro: no tema escuro
  // parte dela cai abaixo do contraste mínimo contra o corpo do ribbon e o
  // ícone some. Clareia só quem precisa, sem reescrever cada manifest.
  if (!color) return color;
  const isDark = $appdata.get<boolean>(KEYS.SHELL.IS_DARK, false);
  return isDark ? ensureContrastOnDark(color) : color;
}

function resolveBtnLabel(btn: RibbonButton): string {
  if (btn.stateBinding) {
    const val = $userdata.get(btn.stateBinding.watchPath);
    return val ? btn.stateBinding.labelOn || btn.label : btn.stateBinding.labelOff || btn.label;
  }
  return btn.label;
}

function isLargeRibbonItem(btn: RibbonButton): boolean {
  if (btn.type === "screen") return true;
  if (btn.customButton) return false;
  return !btn.type && (btn.size || "large") === "large";
}

function isCompactRibbonItem(btn: RibbonButton): boolean {
  return !isLargeRibbonItem(btn);
}

function getCompactTrackClass(): string {
  // A faixa Violin troca o grid de 3 linhas por 2 e dispensa a distinção
  // web/desktop: o overflow é horizontal nos dois casos.
  if (isStrip.value) return "ribbon-group-track--strip";
  return Platform.isDesktop
    ? "ribbon-group-track--compact-desktop"
    : "ribbon-group-track--compact-web";
}

function largeButtons(group: RibbonGroup): RibbonButton[] {
  return (group.buttons || []).filter((btn) => isLargeRibbonItem(btn) && isDependencyMet(btn));
}

function compactButtons(group: RibbonGroup): RibbonButton[] {
  return (group.buttons || []).filter((btn) => isCompactRibbonItem(btn) && isDependencyMet(btn));
}

function getRibbonItemClass(btn: RibbonButton): string {
  if (btn.type === "screen") return "ribbon-group-item--full";
  if (!btn.type && (btn.size ?? "large") === "large") return "ribbon-group-item--full";
  if (btn.type === "action_input") return "ribbon-group-item--compact ribbon-group-item--input";
  if (btn.type === "select" || btn.type === "slider" || btn.type === "number") {
    return "ribbon-group-item--compact ribbon-group-item--field";
  }
  if (btn.type === "checkbox" || btn.type === "switch") {
    // Na faixa Violin o toggle vira um botão-ícone comum — sem a classe
    // --toggle ele não ganha o layout de campo com rótulo.
    if (isStrip.value) return "ribbon-group-item--compact";
    return "ribbon-group-item--compact ribbon-group-item--toggle";
  }
  return "ribbon-group-item--compact";
}

function onButtonIntent(btn: RibbonButton): void {
  if (btn.module) prefetchModule(btn.module);
}

function executeButton(btn: RibbonButton): void {
  if (btn.module) {
    if (!$modules.check(btn.module)) {
      console.error(`[RibbonPageBody] Module "${btn.module}" not available`);
      $alert.error(`shell.not_implemented`);
      return;
    }
    $modules.open(btn.module);
    $appdata.set(`modules.${btn.module}.last_btn`, btn.id);
    // Navega para a página contextual mesmo quando o módulo já está ativo
    // (o watch de active_module não dispara se o valor não muda). Em Violin
    // a store ignora: quem mostra o contexto é a faixa do módulo.
    ribbonStore.selectContextualPageForModule(btn.module);
    return;
  }
  if (btn.action === "search_music") {
    shell.openMusicSearch();
    return;
  }
  if (btn.action === "bible_search") {
    shell.openBibleSearch();
    return;
  }
  if (btn.action && btn.action in LITURGY_ACTIONS) {
    Broadcast.send(BROADCAST_TYPE.LITURGY_RIBBON_ACTION, {
      action: LITURGY_ACTIONS[btn.action],
    });
    return;
  }
  if (btn.action && btn.action in BIBLE_ACTIONS) {
    Broadcast.send(BROADCAST_TYPE.BIBLE_RIBBON_ACTION, {
      action: BIBLE_ACTIONS[btn.action],
    });
    return;
  }
  if (btn.action && EDITOR_ACTIONS.has(btn.action)) {
    Broadcast.send(BROADCAST_TYPE.MODULE_RIBBON_ACTION, {
      module: "slide_editor",
      action: btn.action.replace(/^editor_/, ""),
    });
    return;
  }
  if (btn.action) {
    const actions = [
      "counter",
      "draw",
      "name_draw",
      "clock",
      "stopwatch",
      "timer_worship",
      "timer",
      "message_board",
      "online_videos",
      "custom_online_videos",
      "hymnal_1996",
      "hymnal",
      "bible_search",
      "media_library",
      "overlay",
      "background_sound",
      "background_projection",
      "scheduled_items",
    ];
    const pattern = new RegExp(`^(${actions.join("|")})_(.+)$`);
    const m = btn.action.match(pattern);
    if (m) {
      Broadcast.send(BROADCAST_TYPE.MODULE_RIBBON_ACTION, {
        module: m[1],
        action: m[2],
      });
      return;
    }
  }
}
</script>

<style scoped>
.ribbon-body {
  display: flex;
  align-items: stretch;
  height: var(--lj-ribbon-body-height);
  background: var(--lj-body-bg);
  border-bottom: 1px solid var(--lj-body-border);
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  z-index: 1;
  padding-left: var(--lj-space-3);
  transition: background var(--lj-transition-normal);
}

.ribbon-body--ctx {
  background: var(--lj-body-bg-ctx);
}

/* ------------------------------------------------------------------ *
 * Faixa contextual (variant strip) — Violin
 * ------------------------------------------------------------------ *
 * Auto-altura (poucos itens → faixa mais baixa) com teto de 70px e sem
 * rolagem vertical: o que não couber empurra para a rolagem horizontal.
 * Os tokens declarados aqui reescalem os grupos, botões e campos sem vazar
 * para a ribbon — este elemento é o escopo deles dentro da faixa. */
.ribbon-body--strip {
  --lj-ribbon-body-height: 70px;
  --lj-group-label-height: 12px;
  --lj-large-btn-width: 34px;
  --lj-large-btn-height: 34px;
  flex: 1;
  min-width: 0;
  height: auto;
  max-height: 70px;
  background: transparent;
  border-bottom: none;
}

/* 2 linhas no lugar das 3 do grid clássico. */
.ribbon-group-track--strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  grid-template-rows: repeat(2, max-content);
  justify-content: start;
  align-content: start;
  flex: 1 1 auto;
  min-height: 0;
  gap: var(--lj-space-1);
  overflow-x: auto;
  overflow-y: hidden;
}

/* Apertam as linhas para as duas caberem em 70px com o rótulo de grupo. */
.ribbon-body--strip .ribbon-group-track--large {
  gap: var(--lj-space-2);
  padding-bottom: 0;
}

.ribbon-body--strip .ribbon-group-item--compact .ribbon-field-wrap,
.ribbon-body--strip .ribbon-group-item--compact .ribbon-action-input {
  padding-top: 0;
  padding-bottom: 0;
}

.ribbon-group-track {
  display: flex;
  min-width: 0;
}

.ribbon-group-track--large {
  flex: 0 0 auto;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: var(--lj-space-2);
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: var(--lj-space-1);
}

.ribbon-group-track--compact {
  flex: 1 1 auto;
  min-height: 0;
  gap: var(--lj-space-2);
}

.ribbon-group-track--compact-web {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  grid-template-rows: repeat(3, max-content);
  justify-content: start;
  align-content: start;
  overflow-x: auto;
  overflow-y: hidden;
}

.ribbon-group-track--compact-desktop {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  grid-template-rows: repeat(3, max-content);
  justify-content: start;
  align-content: start;
  overflow-x: auto;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: none;
}

.ribbon-group-track--compact-desktop::-webkit-scrollbar {
  display: none;
}

.ribbon-group-item {
  display: flex;
  flex: 0 0 auto;
}

.ribbon-group-item--full {
  width: max-content;
}

.ribbon-group-item--compact {
  width: max-content;
}

.ribbon-body::-webkit-scrollbar {
  height: 4px;
}

/* Sombra na borda enquanto houver grupo além dela.
   `inset` porque o elemento é o próprio container de rolagem: a sombra fica
   presa à borda visível em vez de deslizar junto com o conteúdo. */
.ribbon-body {
  --lj-ribbon-sombra: var(--lj-black-alpha-18);
}

[data-theme="dark"] .ribbon-body {
  --lj-ribbon-sombra: var(--lj-white-alpha-18);
}

.ribbon-body--sobra-fim {
  box-shadow: inset -20px 0 14px -14px var(--lj-ribbon-sombra);
}

.ribbon-body--sobra-inicio {
  box-shadow: inset 20px 0 14px -14px var(--lj-ribbon-sombra);
}

.ribbon-body--sobra-inicio.ribbon-body--sobra-fim {
  box-shadow:
    inset 20px 0 14px -14px var(--lj-ribbon-sombra),
    inset -20px 0 14px -14px var(--lj-ribbon-sombra);
}

.ribbon-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--lj-text-muted);
  font-size: var(--lj-text-base);
}

.ribbon-action-input {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--lj-space-2);
  padding: var(--lj-space-1) 0;
  font-size: var(--lj-text-base);
}
.ribbon-action-input__field {
  width: var(--lj-small-btn-width);
  height: var(--lj-ui-h-sm);
  padding: 0 var(--lj-ui-px-sm);
  border: var(--lj-ui-border);
  border-radius: var(--lj-ui-radius);
  background: var(--lj-surface-bg);
  color: var(--lj-text);
  font: inherit;
  outline: none;
}
.ribbon-action-input__field:focus {
  border-color: var(--lj-ui-accent);
  box-shadow: var(--lj-ui-focus);
}

.ribbon-field-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--lj-space-2);
  padding: var(--lj-space-1) var(--lj-space-3);
  min-width: var(--lj-small-btn-width);
  font-size: var(--lj-text-base);
}

.ribbon-group-item--compact .ribbon-field-wrap,
.ribbon-group-item--compact .ribbon-action-input {
  flex-direction: row;
  align-items: center;
  min-width: 0;
  gap: var(--lj-ui-gap-md);
  padding: var(--lj-space-1) var(--lj-space-3);
}

.ribbon-group-item--compact .ribbon-action-input__field {
  width: 90px;
}

.ribbon-field-label {
  color: var(--lj-text-muted);
  font-size: inherit;
  font-weight: var(--lj-weight-medium);
  line-height: 1.25;
  white-space: nowrap;
}

.ribbon-group-item--field .ribbon-field-label {
  min-width: var(--lj-ribbon-field-label-width);
}

.ribbon-field-select {
  height: var(--lj-ui-h-sm);
  padding: 0 var(--lj-ui-px-sm);
  border: var(--lj-ui-border);
  border-radius: var(--lj-ui-radius);
  background: var(--lj-surface-bg);
  color: var(--lj-text);
  font: inherit;
  outline: none;
}

.ribbon-field-select:focus {
  border-color: var(--lj-ui-accent);
  box-shadow: var(--lj-ui-focus);
}

.ribbon-field-number {
  height: var(--lj-ui-h-sm);
  padding: 0 var(--lj-ui-px-sm);
  border: var(--lj-ui-border);
  border-radius: var(--lj-ui-radius);
  background: var(--lj-surface-bg);
  color: var(--lj-text);
  font: inherit;
  outline: none;
  width: 90px;
}

.ribbon-field-number:focus {
  border-color: var(--lj-ui-accent);
  box-shadow: var(--lj-ui-focus);
}

.ribbon-slider-row {
  display: flex;
  align-items: center;
  gap: var(--lj-ui-gap-md);
}
.ribbon-slider {
  flex: 1;
  min-width: 100px;
}
.ribbon-slider-value {
  font-size: var(--lj-text-sm);
  font-weight: var(--lj-weight-medium);
  color: var(--lj-text);
  white-space: nowrap;
  min-width: 32px;
  text-align: right;
}

.ribbon-field-checkbox {
  display: flex;
  align-items: center;
  gap: var(--lj-ui-gap-sm);
  padding: var(--lj-space-1);
  font-size: var(--lj-text-base);
  cursor: pointer;
  white-space: nowrap;
  color: var(--lj-text);
}

.ribbon-field-checkbox input {
  margin: 0;
}

.ribbon-switch {
  padding: var(--lj-space-1);
}
.ribbon-field-switch {
  font-size: var(--lj-text-base);
}
</style>
