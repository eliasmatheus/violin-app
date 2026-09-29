import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

// Executa a mesma interação e geometria contra o CSS extraído/minificado,
// cuja ordem de carregamento pode diferir dos estilos injetados pelo Vite dev.
// O build fica fora de dist/ para preservar artefatos de empacotamento locais.
export default defineConfig({
  ...base,
  testMatch: ["video-ribbon-layout.spec.js", "ui-style-parity.spec.js"],
  use: { ...base.use, baseURL: "http://localhost:5014", serviceWorkers: "block" },
  webServer: [
    base.webServer,
    {
      command:
        "npx vite build --outDir test-results/desktop-style-build && npx vite preview --outDir test-results/desktop-style-build --port 5014 --strictPort",
      url: "http://localhost:5014",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...base.webServer.env, VITE_TARGET: "desktop" },
    },
  ],
});
