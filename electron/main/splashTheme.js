"use strict";

// Espelha os IDs de src/config/Themes.ts. O splash roda no main process antes
// do renderer e precisa resolver a preferência sem carregar código Vue/TS.
const THEME_IDS = new Set([
  "light",
  "dark",
  "black",
  "blue",
  "darkblue",
  "green",
  "orange",
  "purple",
  "pink",
  "terracota",
]);
const DEFAULT_LIGHT_THEME = "darkblue";

function resolveSplashTheme(userData, systemDark) {
  const preference = userData?.options?.theme;
  if (THEME_IDS.has(preference)) return preference;

  // Valor ausente/inválido equivale a "auto", como no renderer.
  if (systemDark === true) return "dark";
  const lastLight = userData?.theme_last_light;
  return THEME_IDS.has(lastLight) && lastLight !== "dark"
    ? lastLight
    : DEFAULT_LIGHT_THEME;
}

module.exports = { resolveSplashTheme };
