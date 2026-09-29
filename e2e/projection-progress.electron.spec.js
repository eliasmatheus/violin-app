/**
 * Measures the progress bar in screen coordinates, not only DOM visibility:
 * a rendered bar can still sit outside the physical display on macOS.
 * Run: VITE_TARGET=desktop LJ_RUN_PROJECTION_PROGRESS=1 \
 *   npx playwright test e2e/projection-progress.electron.spec.js --workers=1
 * Windows are invisible by default. LJ_E2E_VISIBLE_WINDOWS=1 also tests kiosk.
 */
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nodeProcess from "node:process";
import { closeElectronApp } from "./helpers/electron-processes.mjs";

test.skip(
  nodeProcess.platform !== "darwin" || nodeProcess.env.LJ_RUN_PROJECTION_PROGRESS !== "1",
  "macOS projection geometry test is opt-in"
);
test.use({ trace: "off", screenshot: "off", video: "off" });

test("music progress stays inside the display when opened, repositioned and reopened", async () => {
  test.setTimeout(90_000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lj-projection-progress-"));
  const env = {
    ...nodeProcess.env,
    LJ_E2E_USER_DATA: root,
    LJ_E2E_BACKGROUND_WINDOWS: nodeProcess.env.LJ_E2E_VISIBLE_WINDOWS === "1" ? "0" : "1",
    ELECTRON_DEV: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;

  try {
    await fs.mkdir(path.join(root, "storage"), { recursive: true });
    await fs.writeFile(
      path.join(root, "storage", "user_data.json"),
      JSON.stringify({
        options: {
          telemetry: false,
          check_updates_on_start: false,
          auto_download_updates: false,
          slide: { show_projection_progress_bar: true },
          dev: { devtools_projections: false, devtools_main_window: false },
        },
      })
    );
    app = await electron.launch({
      args: [
        "-r",
        path.resolve("e2e/helpers/loopback-network.cjs"),
        ".",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
      ],
      cwd: nodeProcess.cwd(),
      env,
      timeout: 60_000,
    });

    let main;
    await expect
      .poll(
        () => {
          main = app.windows().find((page) => page.url().includes("localhost:5002"));
          return Boolean(main);
        },
        { timeout: 60_000 }
      )
      .toBe(true);
    await main.waitForFunction(() => Boolean(window.louvorjaApi?.windows));
    const displays = await main.evaluate(() => window.louvorjaApi.displays.list());
    expect(displays.length).toBeGreaterThan(0);

    const openProjection = async (display) => {
      const opened = await main.evaluate(
        (monitorId) =>
          window.louvorjaApi.windows.open({
            route: "/projection",
            feature: "musicas",
            monitorId,
            fullscreen: true,
            frame: false,
          }),
        display.id
      );
      expect(opened.id).toBeGreaterThan(0);
      let projection;
      await expect
        .poll(() => {
          projection = app.windows().find((page) => page.url().endsWith("/projection"));
          return Boolean(projection);
        })
        .toBe(true);
      await projection.locator(".lj-slide--ready").waitFor();
      await projection.evaluate(async () => {
        const { default: broadcast } = await import("/src/helpers/Broadcast.ts");
        const { BROADCAST_TYPE } = await import("/src/helpers/BroadcastTypes.ts");
        broadcast.send(BROADCAST_TYPE.SLIDE_CHANGE, {
          slide: { lyric: "Progresso na projeção" },
          title: "Teste",
          progress: 64,
          slide_index: 1,
          total_slides: 3,
        });
      });
      await expect(projection.locator(".lj-slide__progress")).toBeVisible();
      return { id: opened.id, page: projection };
    };

    const assertBarOnDisplay = async (projection, display) => {
      const content = await app.evaluate(
        ({ BrowserWindow }, id) => BrowserWindow.fromId(id).getContentBounds(),
        projection.id
      );
      const bar = await projection.page.locator(".lj-slide__progress").boundingBox();
      expect(bar).not.toBeNull();
      expect(content).toEqual(display.bounds);
      expect(content.x + bar.x).toBe(display.bounds.x);
      expect(content.y + bar.y).toBe(display.bounds.y + display.bounds.height - bar.height);
      expect(content.y + bar.y + bar.height).toBe(display.bounds.y + display.bounds.height);
      await expect
        .poll(async () => {
          const currentBar = await projection.page.locator(".lj-slide__progress").boundingBox();
          return currentBar.width / display.bounds.width;
        })
        .toBeCloseTo(0.64, 3);
    };

    for (const display of displays) {
      const projection = await openProjection(display);
      await assertBarOnDisplay(projection, display);
      // Use the real factory's repositioning path, which hotplug also uses.
      await app.evaluate(async (_, target) => {
        const { createRequire } = globalThis.process.getBuiltinModule("node:module");
        const require = createRequire(`${globalThis.process.cwd()}/electron/main.cjs`);
        require("./main/windowFactory.js").reconcile(() => target);
      }, display);
      await assertBarOnDisplay(projection, display);
      await main.evaluate(() => window.louvorjaApi.windows.close("musicas"));
      await expect.poll(() => projection.page.isClosed()).toBe(true);
      const reopened = await openProjection(display);
      expect(reopened.id).not.toBe(projection.id);
      await assertBarOnDisplay(reopened, display);
      await reopened.page.keyboard.press("Escape");
      await expect.poll(() => reopened.page.isClosed()).toBe(true);
    }
  } finally {
    try {
      if (app) expect((await closeElectronApp(app)).forced).toBe(false);
    } finally {
      await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
});
