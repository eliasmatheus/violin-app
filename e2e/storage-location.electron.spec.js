/** Offline storage migration and folder change using a real, isolated Electron profile. */
import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nodeProcess from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { closeElectronApp } from "./helpers/electron-processes.mjs";

test.skip(nodeProcess.env.LJ_RUN_STORAGE_LOCATION !== "1", "Real Electron storage test is opt-in");
test.use({ trace: "off", screenshot: "off", video: "off" });

test("centralizes legacy files and keeps IndexedDB and offline videos after a folder change and restart", async () => {
  test.setTimeout(120_000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lj-storage-location-"));
  const dataDir = path.join(root, "documents", "LouvorJA Violin");
  const chosen = path.join(root, "Chosen data folder");
  const id = "aaaaaaaaaaa";
  const env = {
    ...nodeProcess.env,
    LJ_E2E_USER_DATA: root,
    LJ_E2E_BACKGROUND_WINDOWS: "1",
    ELECTRON_DEV: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;

  async function output(file, contents) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }
  async function launch() {
    app = await electron.launch({
      cwd: nodeProcess.cwd(),
      args: [
        "-r",
        path.resolve("e2e/helpers/loopback-network.cjs"),
        ".",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
      ],
      env,
      timeout: 60_000,
    });
    let page;
    await expect
      .poll(
        () => {
          page = app.windows().find((candidate) => candidate.url().includes("localhost:5002"));
          return Boolean(page);
        },
        { timeout: 60_000 }
      )
      .toBe(true);
    await page.waitForFunction(() => Boolean(window.louvorjaApi?.storage));
    await page
      .locator('[data-testid="modules-ready"]')
      .waitFor({ state: "attached", timeout: 60_000 });
    return page;
  }
  async function database(page, write) {
    return page.evaluate(
      (value) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("storage-location-fixture", 1);
          request.onupgradeneeded = () => request.result.createObjectStore("data");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("data", value ? "readwrite" : "readonly");
            const operation = value
              ? tx.objectStore("data").put(value, "saved")
              : tx.objectStore("data").get("saved");
            tx.oncomplete = () => {
              db.close();
              resolve(operation.result);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          };
        }),
      write
    );
  }
  async function expectSingleInstance() {
    const second = await promisify(execFile)(
      app.process().spawnfile,
      ["-r", path.resolve("e2e/helpers/loopback-network.cjs"), "."],
      { cwd: nodeProcess.cwd(), env, timeout: 15_000 }
    );
    expect(second.stderr).toContain("Segunda instância detectada");
    expect(await app.evaluate(() => true)).toBe(true);
  }

  try {
    await output(
      path.join(root, "storage", "user_data.json"),
      JSON.stringify({
        options: {
          telemetry: false,
          check_updates_on_start: false,
          auto_download_updates: false,
          dev: { devtools_projections: false, devtools_main_window: false },
        },
      })
    );
    await output(path.join(root, "json_db", "storage-fixture.json"), '{"offline":true}');
    await output(path.join(root, "bin", "fixture-tool"), "tool");
    await output(path.join(root, "online_videos", `${id}.mp4`), "0123456789");
    await output(path.join(root, "online_videos", `${id}.keep`), "");

    // Cria um IndexedDB real no endereço usado pelas versões anteriores.
    const seed = path.join(root, "seed-profile.cjs");
    await output(
      seed,
      `
      const { app, BrowserWindow } = require("electron");
      app.setPath("userData", process.env.LJ_E2E_USER_DATA);
      app.setPath("sessionData", process.env.LJ_E2E_USER_DATA);
      app.whenReady().then(() => {
        const window = new BrowserWindow({ show: false });
        window.loadURL("http://localhost:5002");
      });
      app.on("window-all-closed", () => app.quit());
    `
    );
    app = await electron.launch({
      cwd: nodeProcess.cwd(),
      env,
      args: [
        "-r",
        path.resolve("e2e/helpers/loopback-network.cjs"),
        seed,
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
      ],
    });
    const seedPage = await app.firstWindow();
    await seedPage.waitForURL("http://localhost:5002/**");
    await database(seedPage, "legacy offline database");
    expect((await closeElectronApp(app, { timeoutMs: 15_000 })).forced).toBe(false);
    app = null;

    let page = await launch();
    await expectSingleInstance();
    expect(await database(page)).toBe("legacy offline database");
    const profile = await app.evaluate(({ app }) => ({
      userData: app.getPath("userData"),
      sessionData: app.getPath("sessionData"),
    }));
    expect(profile).toEqual({
      userData: path.join(dataDir, ".electron"),
      sessionData: path.join(dataDir, ".electron"),
    });
    expect(await page.evaluate(() => window.louvorjaApi.storage.stats())).toMatchObject({
      dataDir,
      restartRequired: false,
    });
    expect(await page.evaluate(() => window.louvorjaApi.onlineVideo.list())).toEqual([
      expect.objectContaining({ id, kept: true, size: 10 }),
    ]);
    expect(await fs.readFile(path.join(dataDir, "bin", "fixture-tool"), "utf8")).toBe("tool");
    expect(await fs.readFile(path.join(dataDir, "json_db", "storage-fixture.json"), "utf8")).toBe(
      '{"offline":true}'
    );
    await database(page, "offline database survives");

    await page.evaluate(
      (dir) => window.louvorjaApi.storage.setDataDir(dir, { moveExisting: true }),
      chosen
    );
    expect(await page.evaluate(() => window.louvorjaApi.storage.stats())).toMatchObject({
      dataDir: chosen,
      restartRequired: true,
    });
    expect(await page.evaluate((video) => window.louvorjaApi.onlineVideo.has(video), id)).toBe(
      true
    );
    const ranged = await app.evaluate(async ({ net }, video) => {
      const response = await net.fetch(`louvorja://onlinevideo/${video}.mp4`, {
        headers: { Range: "bytes=3-5" },
      });
      return { status: response.status, body: await response.text() };
    }, id);
    expect(ranged).toEqual({ status: 206, body: "345" });
    expect((await closeElectronApp(app, { timeoutMs: 15_000 })).forced).toBe(false);
    app = null;

    page = await launch();
    await expectSingleInstance();
    expect(await app.evaluate(({ app }) => app.getPath("userData"))).toBe(
      path.join(chosen, ".electron")
    );
    expect(await database(page)).toBe("offline database survives");
    expect(await page.evaluate(() => window.louvorjaApi.storage.stats())).toMatchObject({
      dataDir: chosen,
      restartRequired: false,
    });
    expect(await page.evaluate((video) => window.louvorjaApi.onlineVideo.has(video), id)).toBe(
      true
    );
    expect(await fs.readFile(path.join(chosen, "Videos", `${id}.mp4`), "utf8")).toBe("0123456789");
    expect(await fs.readFile(path.join(chosen, "json_db", "storage-fixture.json"), "utf8")).toBe(
      '{"offline":true}'
    );
    expect(await fs.readFile(path.join(chosen, "bin", "fixture-tool"), "utf8")).toBe("tool");
    await expect(fs.stat(path.join(dataDir, ".electron"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    if (app) await closeElectronApp(app, { timeoutMs: 15_000 });
    await fs.rm(root, { recursive: true, force: true });
  }
});
