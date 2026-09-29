// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";

const require = createRequire(import.meta.url);
const express = require("express");
const { install } = require("../spa.js");
const html = "<!doctype html><html><head></head><body>SPA fixture</body></html>";
const servers = [];
let distDir;

beforeAll(async () => {
  distDir = await fs.mkdtemp(path.join(os.tmpdir(), "lj-spa-root-"));
  await fs.writeFile(path.join(distDir, "index.html"), html);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        })
    )
  );
});

afterAll(async () => fs.rm(distDir, { recursive: true, force: true }));

async function start({ isDev, remote, serveDistToRemote = false, getUserData }) {
  // Stand in for Vite while exercising the actual proxy and Express routes.
  vi.spyOn(http, "request").mockImplementation(
    (_options, onResponse) =>
      new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
        final(done) {
          const response = Readable.from([Buffer.from(html)]);
          response.statusCode = 200;
          response.headers = { "content-type": "text/html" };
          onResponse(response);
          done();
        },
      })
  );
  const app = express();
  if (remote) {
    app.use((req, _res, next) => {
      Object.defineProperty(req, "ip", { value: "192.168.1.50" });
      next();
    });
  }
  install(app, { isDev, distDir, getToken: () => null, getUserData, serveDistToRemote });
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return (route) => fetch(base + route);
}

describe("HTTP root permission", () => {
  it.each([
    { isDev: true, remote: false },
    { isDev: true, remote: true },
    { isDev: false, remote: false },
    { isDev: false, remote: true },
    { isDev: true, remote: true, serveDistToRemote: true },
  ])("applies live toggles for %j without restarting the server", async (mode) => {
    let userData = { options: { dev: { allow_http_root: false } } };
    const request = await start({ ...mode, getUserData: () => userData });
    expect((await request("/")).status).toBe(404);

    userData.options.dev.allow_http_root = true;
    const allowed = await request("/");
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain("SPA fixture");

    userData = { options: { dev: { allow_http_root: false } } };
    expect((await request("/")).status).toBe(404);
    for (const route of ["/obs", "/projection/return", "/remote", "/api/ping"]) {
      expect((await request(route)).status, route).toBe(200);
    }
  });

  it.each([true, false])("rejects invalid preferences in dev=%s", async (isDev) => {
    let value;
    const request = await start({
      isDev,
      remote: true,
      getUserData: () => ({ options: { dev: { allow_http_root: value } } }),
    });
    for (value of [undefined, null, "true", "false", 1, {}, false]) {
      expect((await request("/")).status, `preference=${String(value)}`).toBe(404);
    }
  });
});
