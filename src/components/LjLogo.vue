<template>
  <img class="lj-logo" :src="src" :width="size" :height="size" alt="LouvorJA Violin" />
</template>

<script setup>
import { computed } from "vue";
import logoUrl from "@/assets/img/logo.svg";
import logoDepthUrl from "@/assets/img/logo-profundidade.svg";

const props = defineProps({
  size: {
    type: [String, Number],
    default: 24,
  },
});

// Abaixo de 32px as sombras das camadas só borram o desenho.
const src = computed(() => (Number(props.size) >= 32 ? logoDepthUrl : logoUrl));
</script>

<style scoped>
.lj-logo {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  object-fit: contain;
}
</style>
