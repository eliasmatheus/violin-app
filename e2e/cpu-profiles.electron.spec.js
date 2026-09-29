import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nodeProcess from "node:process";
import { closeElectronApp } from "./helpers/electron-processes.mjs";

test.skip(nodeProcess.env.LJ_RUN_CPU_PROFILE !== "1", "Real Electron CPU capture is opt-in");
test.use({ trace: "off", screenshot: "off", video: "off" });

test("captures known follow-up CPU work while the incident monitor suppresses repeat reports", async () => {
  test.setTimeout(60000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lj-cpu-profile-e2e-"));
  const env = { ...nodeProcess.env, LJ_CPU_TEST_USER_DATA: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ args: [path.resolve("e2e/fixtures/cpu-profiles.cjs")], env });
    await expect.poll(() => app.evaluate(() => Boolean(globalThis.__cpuProbe))).toBe(true);
    const { incidents, profile } = await app.evaluate(() => globalThis.__cpuProbe.exercise());
    expect(incidents).toHaveLength(1);
    expect(profile).toMatchObject({
      cpu_profile_status: "completed",
      cpu_profile_relation: "followup_window",
      cpu_profile_target: "main",
      cpu_profile_timing_basis: "sampled_elapsed_time",
      cpu_profile_sampling_interval_us: 20000,
      cpu_profile_trigger_incident_id: incidents[0].incident_id,
    });
    expect(profile.cpu_profile_duration_ms).toBeGreaterThanOrEqual(20000);
    expect(profile.cpu_profile_duration_ms).toBeLessThan(25000);
    expect(profile.cpu_profile_observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          max_delay_ms: expect.any(Number),
          main_cpu_percent: expect.any(Number),
          sample_window_ms: expect.any(Number),
        }),
      ])
    );
    expect(profile.cpu_profile_observations.some((sample) => sample.max_delay_ms >= 1000)).toBe(
      true
    );
    expect(profile.cpu_profile_summary.top_frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: "knownFollowupCpuWork",
          source: "electron/main/cpu-fixture.cjs",
        }),
      ])
    );
    expect(JSON.stringify(profile)).not.toMatch(/file:\/\/|\/Users\/|raw_profile|callFrame/);
  } finally {
    if (app) await closeElectronApp(app);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
