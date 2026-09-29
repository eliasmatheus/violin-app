<template>
  <img class="lj-logo" :src="logoUrl" :width="size" :height="size" alt="LouvorJA Violin" />
</template>

<script setup>
import logoUrl from "@/assets/img/logo.svg";

defineProps({
  size: {
    type: [String, Number],
    default: 24,
  },
});
</script>

<style scoped>
.lj-logo {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  object-fit: contain;
}
</style>
