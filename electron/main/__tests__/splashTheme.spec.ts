// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  AUTO_THEME_ID,
  DARK_THEME_ID,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_PREFERENCE,
  THEME_IDS,
  isThemePreference,
  resolveTheme,
  type ThemeId,
  type ThemePreference,
} from "../../../src/config/Themes";

const require = createRequire(import.meta.url);
const { resolveSplashTheme } = require("../splashTheme.js") as {
  resolveSplashTheme: (userData: unknown, systemDark: boolean) => ThemeId;
};

describe("resolveSplashTheme", () => {
  it.each(THEME_IDS)("respeita o tema explícito %s, mesmo quando o sistema muda", (theme) => {
    const userData = { options: { theme }, theme_last_light: "green" };

    expect(resolveSplashTheme(userData, false)).toBe(theme);
    expect(resolveSplashTheme(userData, true)).toBe(theme);
  });

  it("resolve Automático conforme o sistema e o último tema claro na raiz", () => {
    const userData = {
      options: { theme: AUTO_THEME_ID, theme_last_light: "pink" },
      theme_last_light: "green",
    };

    expect(resolveSplashTheme(userData, false)).toBe("green");
    expect(resolveSplashTheme(userData, true)).toBe(DARK_THEME_ID);
  });

  it("usa o padrão quando não há preferência nem último tema claro", () => {
    expect(resolveSplashTheme({}, false)).toBe(DEFAULT_THEME_ID);
    expect(resolveSplashTheme({}, true)).toBe(DARK_THEME_ID);
    expect(resolveSplashTheme(null, false)).toBe(DEFAULT_THEME_ID);
  });

  it.each(["outro-tema", "", null, 42, { id: "blue" }])(
    "trata preferência inválida %j como Automático",
    (invalidTheme) => {
      const userData = { options: { theme: invalidTheme }, theme_last_light: "purple" };

      expect(resolveSplashTheme(userData, false)).toBe("purple");
      expect(resolveSplashTheme(userData, true)).toBe(DARK_THEME_ID);
    }
  );

  it.each(["dark", "outro-tema", null, 42])(
    "descarta último tema claro inválido %j",
    (lastLight) => {
      expect(
        resolveSplashTheme({ options: { theme: AUTO_THEME_ID }, theme_last_light: lastLight }, false)
      ).toBe(DEFAULT_THEME_ID);
    }
  );

  it("ignora a antiga chave theme solta no UserData", () => {
    expect(resolveSplashTheme({ theme: "blue" }, false)).toBe(DEFAULT_THEME_ID);
  });

  it("mantém paridade com o registro e o resolvedor do renderer", () => {
    const preferences: unknown[] = [...THEME_IDS, AUTO_THEME_ID, "inexistente", undefined];
    const lastLights: unknown[] = [undefined, "green", "black", "dark", "inexistente"];

    for (const rawPreference of preferences) {
      const preference: ThemePreference = isThemePreference(rawPreference)
        ? rawPreference
        : DEFAULT_THEME_PREFERENCE;
      for (const systemDark of [false, true]) {
        for (const lastLight of lastLights) {
          const userData = {
            options: { theme: rawPreference },
            theme_last_light: lastLight,
          };
          expect(resolveSplashTheme(userData, systemDark)).toBe(
            resolveTheme(preference, systemDark, lastLight)
          );
        }
      }
    }
  });
});
