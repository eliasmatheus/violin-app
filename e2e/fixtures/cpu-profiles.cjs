"use strict";
/* global require, __dirname, process */

const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const { createCpuProfileCapture } = require("../../electron/main/cpuProfileCapture.js");
const { createRuntimeHealthMonitor } = require("../../electron/main/runtimeHealth.js");

app.setPath("userData", process.env.LJ_CPU_TEST_USER_DATA);
app.dock?.hide();
const appRoot = path.resolve(__dirname, "../..");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const knownBurn = vm.runInThisContext(`(function knownFollowupCpuWork() {
  const until = performance.now() + 1100;
  while (performance.now() < until) { /* controlled follow-up workload */ }
})`, { filename: path.join(appRoot, "electron/main/cpu-fixture.cjs") });

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await window.loadURL("data:text/html,<title>Isolated CPU diagnostic test</title>");
  const incidents = [];
  let result;
  const completed = new Promise((resolve) => { result = resolve; });
  const capture = createCpuProfileCapture({ appRoot, enabled: () => true, onResult: result });
  const monitor = createRuntimeHealthMonitor({
    sampleIntervalMs: 1000,
    incidentCooldownMs: 60000,
    criticalDelayMs: 1000,
    onEventLoopSample: capture.observeEventLoopSample,
    emitIncident: (incident) => incidents.push({ ...incident, ...capture.handleIncident(incident) }),
  });
  monitor.start();
  app.on("will-quit", () => { monitor.stop(); capture.cancel(); });
  globalThis.__cpuProbe = {
    async exercise() {
      await delay(100);
      const until = performance.now() + 1200;
      while (performance.now() < until) { /* first incident arms capture */ }
      await delay(100);
      const first = incidents.find((incident) => incident.incident_type === "main_event_loop_stall");
      if (!first) throw new Error("The real event-loop monitor did not detect the first block");
      let recording = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (capture.handleIncident(first).cpu_profile_status === "recording") { recording = true; break; }
        await delay(50);
      }
      if (!recording) throw new Error("The profile backend did not become ready");
      await delay(100);
      knownBurn();
      await delay(100);
      monitor.sampleEventLoop();
      const profile = await completed;
      monitor.stop();
      return { incidents, profile };
    },
  };
});
