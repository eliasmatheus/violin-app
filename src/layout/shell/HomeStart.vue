<template>
  <section class="home-start" :aria-label="$t('shell.home_title')">
    <LjLogo :size="56" class="home-start__logo" />
    <h1>{{ $t("shell.home_title") }}</h1>
    <p>{{ $t("shell.home_description") }}</p>
    <div class="home-start__actions">
      <button type="button" @click="open(ModuleEnum.MUSICS)">
        {{ $t("shell.home_music") }}
      </button>
      <button type="button" @click="open(ModuleEnum.BIBLE)">
        {{ $t("shell.home_bible") }}
      </button>
      <button type="button" @click="open(ModuleEnum.LITURGY)">
        {{ $t("shell.home_liturgy") }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import LjLogo from "@/components/LjLogo.vue";
import { ModuleEnum } from "@/enums/ModuleEnum";
import $modules from "@/helpers/Modules";

function open(id: ModuleEnum): void {
  $modules.open(id);
}
</script>

<style scoped>
.home-start {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 100%;
  padding: var(--lj-space-8);
  text-align: center;
  color: var(--lj-home-text);
  font-family: var(--lj-font-shell);
}

.home-start__logo {
  margin-bottom: var(--lj-space-5);
}

.home-start h1 {
  margin: 0;
  font-size: clamp(22px, 2vw, 28px);
  font-weight: var(--lj-weight-semibold);
  letter-spacing: -0.02em;
}

.home-start p {
  margin: var(--lj-space-3) 0 var(--lj-space-7);
  font-size: var(--lj-text-base);
  line-height: 1.5;
}

.home-start__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--lj-space-3);
}

.home-start__actions button {
  display: inline-flex;
  align-items: center;
  gap: var(--lj-space-3);
  min-height: 42px;
  padding: 0 var(--lj-space-5);
  border: 1px solid currentColor;
  border-radius: var(--lj-radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: var(--lj-weight-medium);
  cursor: pointer;
  transition: background var(--lj-transition-fast);
}

.home-start__actions button:hover {
  background: var(--lj-shell-chrome-hover);
}

.home-start__actions button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}

@media (max-width: 600px) {
  .home-start__actions {
    flex-direction: column;
    width: min(100%, 260px);
  }

  .home-start__actions button {
    justify-content: center;
  }
}
</style>
