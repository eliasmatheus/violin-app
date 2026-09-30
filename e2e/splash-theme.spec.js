import { pathToFileURL } from "node:url";
import path from "node:path";
import { test, expect } from "@playwright/test";

const splashFile = path.resolve("electron/splash.html");

const themes = [
  { id: "light", navy: "#29569b", darkSurface: false },
  { id: "dark", navy: "#2e2e2e", darkSurface: true },
  // "black" changes the brand color, but keeps the app's light surfaces.
  { id: "black", navy: "#2e2e2e", darkSurface: false },
  { id: "blue", navy: "#155b8a", darkSurface: false },
  { id: "darkblue", navy: "#1b2a41", darkSurface: false },
  { id: "green", navy: "#077568", darkSurface: false },
  { id: "orange", navy: "#d24726", darkSurface: false },
  { id: "purple", navy: "#80397b", darkSurface: false },
  { id: "pink", navy: "#e91e63", darkSurface: false },
  { id: "terracota", navy: "#722f37", darkSurface: false },
];

function rgbChannels(cssColor) {
  const match = cssColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  expect(match, `Expected an RGB color, got ${cssColor}`).not.toBeNull();
  return match.slice(1, 4).map(Number);
}

function hexChannels(cssColor) {
  const match = cssColor.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  expect(match, `Expected a hex color, got ${cssColor}`).not.toBeNull();
  return match.slice(1, 4).map((channel) => Number.parseInt(channel, 16));
}

function luminance(cssColor) {
  const channels = rgbChannels(cssColor).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first, second) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe("splash theme", () => {
  test.use({ viewport: { width: 508, height: 117 } });

  for (const theme of themes) {
    test(`renders ${theme.id} with the app palette`, async ({ page }) => {
      const url = new URL(pathToFileURL(splashFile));
      url.searchParams.set("theme", theme.id);
      await page.goto(url.href);

      const appearance = await page.evaluate(() => {
        const root = document.documentElement;
        const rootStyle = getComputedStyle(root);
        const bodyStyle = getComputedStyle(document.body);
        const titleStyle = getComputedStyle(document.querySelector(".splash-title"));
        const infoStyle = getComputedStyle(document.querySelector(".splash-info"));
        const iconStyle = getComputedStyle(document.querySelector(".splash-icon"));
        return {
          theme: root.dataset.theme,
          tokensLoaded: Array.from(document.styleSheets).some((sheet) =>
            sheet.href?.endsWith("/src/assets/styles/tokens.css")
          ),
          navy: rootStyle.getPropertyValue("--lj-navy").trim().toLowerCase(),
          navyDark: rootStyle.getPropertyValue("--lj-navy-dark").trim(),
          colorScheme: rootStyle.colorScheme,
          background: bodyStyle.backgroundColor,
          title: titleStyle.color,
          info: infoStyle.color,
          iconBackground: iconStyle.backgroundImage,
          logoLoaded: document.querySelector(".splash-logo").naturalWidth > 0,
        };
      });

      expect(appearance.theme).toBe(theme.id);
      expect(appearance.tokensLoaded).toBe(true);
      expect(appearance.navy).toBe(theme.navy);
      expect(appearance.logoLoaded).toBe(true);
      expect(appearance.iconBackground).not.toBe("none");
      expect(contrastRatio(appearance.title, appearance.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(appearance.info, appearance.background)).toBeGreaterThanOrEqual(4.5);

      if (theme.darkSurface) {
        expect(appearance.colorScheme).toBe("dark");
        expect(luminance(appearance.background)).toBeLessThan(0.08);
        expect(luminance(appearance.title)).toBeGreaterThan(0.6);
      } else {
        expect(appearance.colorScheme).toBe("light");
        expect(luminance(appearance.background)).toBeGreaterThan(0.8);
        expect(luminance(appearance.title)).toBeLessThan(0.2);
        expect(rgbChannels(appearance.title)).toEqual(hexChannels(appearance.navyDark));
      }
    });
  }
});
