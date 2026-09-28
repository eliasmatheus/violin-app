import { test, expect } from "@playwright/test";
import process from "node:process";
import { loadConfigFromFile } from "vite";

test.use({ bypassCSP: false, serviceWorkers: "block" });

test("a CSP de produção web permite imagens importadas como URLs de objeto", async ({ page }) => {
  const previousTarget = process.env.VITE_TARGET;
  let html;
  try {
    process.env.VITE_TARGET = "web";
    const { config } = await loadConfigFromFile({ command: "build", mode: "production" });
    const cspPlugin = config.plugins
      .flat(Infinity)
      .find((plugin) => plugin?.name === "louvorja-csp-prod");
    html = cspPlugin.transformIndexHtml(
      "<!doctype html><html><head><!--CSP_PROD--></head><body></body></html>"
    );
  } finally {
    if (previousTarget === undefined) delete process.env.VITE_TARGET;
    else process.env.VITE_TARGET = previousTarget;
  }

  await page.setContent(html);
  const result = await page.evaluate(async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=";
    const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    const image = new Image();
    try {
      const loaded = await new Promise((resolve) => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = objectUrl;
        document.body.append(image);
      });
      return { loaded, width: image.naturalWidth, height: image.naturalHeight };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  });

  expect(result).toEqual({ loaded: true, width: 1, height: 1 });
});
