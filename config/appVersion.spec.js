// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "vite";
import posthogRollupPlugin from "@posthog/rollup-plugin";
import createViteConfig from "../vite.config.js";
import packageJson from "../package.json";

vi.mock("vite", async (importOriginal) => ({
  ...(await importOriginal()),
  loadEnv: vi.fn(),
}));
vi.mock("@posthog/rollup-plugin", () => ({
  default: vi.fn(() => ({ name: "posthog-test" })),
}));

let originalEnv;
beforeEach(() => {
  originalEnv = { ...process.env };
  vi.clearAllMocks();
  process.env.POSTHOG_API_KEY = "source-map-test-key";
  process.env.POSTHOG_PROJECT_ID = "593997";
  delete process.env.ANALYZE;
});
afterEach(() => {
  process.env = originalEnv;
});

describe("versão do build e dos source maps", () => {
  it.each(["web", "desktop"])("usa o pacote ao compilar %s na branch main", async (target) => {
    vi.mocked(loadEnv).mockReturnValue({ VITE_APP_VERSION: "main", VITE_TARGET: target });
    await createViteConfig({ mode: "production" });

    expect(process.env.VITE_APP_VERSION).toBe(packageJson.version);
    expect(posthogRollupPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({ releaseVersion: packageJson.version }),
      })
    );
  });

  it.each([
    [undefined, packageJson.version],
    ["vmain", packageJson.version],
    ["v2.0.0-beta.8", "2.0.0-beta.8"],
  ])("valida o override %j antes de injetar a versão", async (value, expected) => {
    vi.mocked(loadEnv).mockReturnValue({ VITE_APP_VERSION: value, VITE_TARGET: "desktop" });
    await createViteConfig({ mode: "production" });
    expect(process.env.VITE_APP_VERSION).toBe(expected);
    expect(posthogRollupPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcemaps: expect.objectContaining({ releaseVersion: expected }),
      })
    );
  });
});
