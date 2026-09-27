<template>
  <div class="video-monitors">
    <div class="video-monitors-field">
      <label class="video-monitors-label" for="video-projection-monitor">
        {{ t("ribbon.fields.monitor") }}
      </label>
      <MonitorSelect
        id="video-projection-monitor"
        :model-value="videoMonitor"
        detailed
        size="lg"
        @update:model-value="setVideoMonitor"
      />
    </div>
    <div class="video-monitors-field">
      <label class="video-monitors-label" for="video-return-monitor">
        {{ t("ribbon.fields.return_monitor") }}
      </label>
      <MonitorSelect
        id="video-return-monitor"
        :model-value="returnMonitor"
        :disabled="!showReturn"
        detailed
        size="lg"
        @update:model-value="setReturnMonitor"
      />
      <LjCheckbox
        :model-value="showReturn"
        :label="t('ribbon.fields.show_return')"
        @update:model-value="toggleReturn"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import MonitorSelect from "@/components/inputs/MonitorSelect.vue";
import { LjCheckbox } from "@/components/ui";
import { useDisplays } from "@/composables/useDisplays";
import { useUserDataStore } from "@/stores/userDataStore";
import $userdata from "@/helpers/UserData";
import { KEYS } from "@/constants/UserDataKeys";
import { PROJECTION_TYPE } from "@/constants/Projection";

const { t } = useI18n();
const { getFeatureRole, setFeatureRole } = useDisplays();

const userDataStore = useUserDataStore();
const showReturn = computed(
  () => userDataStore.$state.options?.online_video_projection?.show_return === true
);

// Antes eram passadas chaves de UserData ("options.displays.online_video") onde
// se esperava um nome de feature, então a preferência era gravada numa chave
// que nenhum leitor consultava.
const videoMonitor = ref<string>("");
const returnMonitor = ref<string>("");

onMounted(async () => {
  videoMonitor.value = (await getFeatureRole(PROJECTION_TYPE.ONLINE_VIDEO)) ?? "";
  returnMonitor.value = (await getFeatureRole(PROJECTION_TYPE.ONLINE_VIDEO_RETURN)) ?? "";
});

function setVideoMonitor(val: string) {
  videoMonitor.value = val;
  setFeatureRole(PROJECTION_TYPE.ONLINE_VIDEO, val || null);
}

function setReturnMonitor(val: string) {
  returnMonitor.value = val;
  setFeatureRole(PROJECTION_TYPE.ONLINE_VIDEO_RETURN, val || null);
}

function toggleReturn(checked: boolean) {
  $userdata.set(KEYS.OPTIONS.ONLINE_VIDEO_PROJECTION.SHOW_RETURN, checked);
}
</script>

<style scoped>
.video-monitors {
  display: grid;
  grid-template-columns: repeat(2, var(--lj-opt-select-width));
  align-items: start;
  gap: var(--lj-space-5);
  padding: var(--lj-space-1) var(--lj-space-3);
}
.video-monitors-field {
  display: grid;
  gap: var(--lj-space-2);
  min-width: 0;
}
.video-monitors-label {
  color: var(--lj-text-muted);
  font-size: var(--lj-text-base);
  font-weight: var(--lj-weight-medium);
  line-height: 1.25;
}
</style>
