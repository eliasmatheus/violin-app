<template>
  <!-- O invólucro existe para o CSS com escopo ter onde se prender: LjSelect
       envolve um SelectRoot, que não emite elemento próprio, então nem `:deep`
       alcançaria o gatilho sem um ancestral deste componente. -->
  <div class="lj-monitor-select" :class="{ 'lj-monitor-select--inline': inline }">
    <LjSelect :id="id" v-model="model" :items="options" item-value="role" item-label="label">
      <template #value="{ item }">
        <span class="lj-monitor-select__value">
          <span class="lj-monitor-select__role">{{ item?.label }}</span>
          <span v-if="item?.hint" class="lj-monitor-select__current">— {{ item.hint }}</span>
        </span>
      </template>
      <template #item="{ item }">
        <span class="lj-monitor-select__option">
          {{ item.label }}
          <small v-if="item.hint" class="lj-monitor-select__hint">{{ item.hint }}</small>
        </span>
      </template>
    </LjSelect>
  </div>
</template>

<script setup lang="ts">
/**
 * Escolhe em qual PAPEL de monitor um módulo aparece — não em qual monitor.
 *
 * Os monitores são atribuídos aos papéis uma única vez, em Opções → Monitores.
 * Assim, trocar o projetor de lugar não exige reconfigurar módulo por módulo, e
 * um papel sem monitor simplesmente não abre janela.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import LjSelect from "@/components/ui/LjSelect.vue";
import { DISPLAY_ROLES, useDisplays } from "@/composables/useDisplays";

const props = defineProps<{
  id?: string;
  /** Papel escolhido: "projection" | "stage" | "operator", ou "" para mesma janela. */
  modelValue?: string | null;
  inline?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { t } = useI18n();
const { displays, roles } = useDisplays();

const model = computed({
  get: () => props.modelValue ?? "",
  set: (value) => emit("update:modelValue", String(value)),
});

/** Descreve o monitor atribuído ao papel, ou por que ele não está disponível. */
function hintFor(role: string): string {
  const state = roles.value.find((r) => r.role === role);
  if (!state || state.status === "none") return t("options.monitors.roles.none");
  if (state.status === "pending") return t("options.monitors.roles.missing");
  if (state.status === "ambiguous") return t("options.monitors.roles.ambiguous");

  const display = displays.value.find((d) => d.id === state.displayId);
  const name = display?.label || `#${state.displayId}`;
  return state.status === "inferred" ? `${name} (${t("options.monitors.roles.inferred")})` : name;
}

const options = computed(() => [
  { role: "", label: t("options.slides.same_window"), hint: "" },
  ...DISPLAY_ROLES.map((role) => ({
    role,
    label: t(`options.monitors.roles.${role}`),
    hint: hintFor(role),
  })),
]);
</script>

<style scoped>
.lj-monitor-select {
  width: var(--lj-opt-select-width);
}

.lj-monitor-select--inline {
  width: auto;
}

.lj-monitor-select :deep(.lj-select) {
  width: 100%;
}

.lj-monitor-select__value {
  display: flex;
  align-items: center;
  gap: var(--lj-space-2);
  min-width: 0;
  width: 100%;
  font-family: var(--lj-font-shell);
  font-size: var(--lj-ui-font-md);
  font-weight: var(--lj-weight-regular);
  line-height: 1.2;
}

.lj-monitor-select__role {
  flex: none;
  white-space: nowrap;
}

.lj-monitor-select__current {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--lj-text-muted);
}

.lj-monitor-select__option {
  display: flex;
  flex-direction: column;
}

.lj-monitor-select__hint {
  color: var(--lj-text-subtle);
  font-size: var(--lj-text-xs);
}
</style>
