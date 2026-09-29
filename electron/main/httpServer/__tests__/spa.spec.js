// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const express = require("express");
const spa = require("../spa.js");

let distDir;
let server;
let origin;

beforeEach(async () => {
  distDir = mkdtempSync(path.join(tmpdir(), "louvorja-spa-"));
  writeFileSync(path.join(distDir, "index.html"), "<html><head></head><body></body></html>");
  const app = express();
  spa.install(app, { isDev: false, distDir, getToken: () => "HOST1" });
  server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  rmSync(distDir, { recursive: true, force: true });
});

function runBridge(html, href) {
  const sources = [];
  const delivered = [];
  const window = {
    location: new URL(href),
    dispatchEvent: (event) => delivered.push(event),
  };
  const context = vm.createContext({
    window,
    document: { readyState: "complete" },
    URL,
    EventSource: class {
      constructor(url) {
        this.url = url;
        sources.push(this);
      }
    },
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
  });
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    vm.runInContext(match[1], context);
  }
  return { window, sources, delivered };
}

describe("SPA HTTP — transmissão na mesma máquina", () => {
  it.each([
    ["/controle", "/remote"],
    ["/relogio", "/clock"],
    ["/projecao", "/projection"],
    ["/musica?transmissao", "/obs"],
    ["/musica?retorno", "/projection/return"],
    ["/biblia?retorno", "/projection/bible/return"],
    ["/biblia?transmissao", "/obs/bible"],
  ])("%s abre a rota correta e conecta ao SSE via loopback", async (alias, route) => {
    const separator = alias.includes("?") ? "&" : "?";
    const response = await fetch(`${origin}${alias}${separator}token=USER1`);
    expect(response.status).toBe(200);
    expect(new URL(response.url).pathname).toBe(route);
    const { window, sources } = runBridge(await response.text(), response.url);
    expect(window.location.hash).toBe(`#${route}`);
    expect(window.LJ_REMOTE_CLIENT).toBe(true);
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe("/events?token=USER1");
  });

  it("guarda o replay anterior ao boot e entrega atualizações depois dele", async () => {
    const response = await fetch(`${origin}/obs`);
    const { window, sources, delivered } = runBridge(await response.text(), response.url);
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe("/events?token=HOST1");
    const replay = { type: "slide_change", payload: { slide: { lyric: "Atual" } } };
    sources[0].onmessage({ data: JSON.stringify(replay) });
    expect(window.__ljSseBuffer).toEqual([replay]);
    expect(delivered).toEqual([]);

    window.__ljSseDrained = true;
    const update = { type: "slide_change", payload: { slide: { lyric: "Próximo" } } };
    sources[0].onmessage({ data: JSON.stringify(update) });
    expect(delivered).toEqual([{ type: "louvorja-sse", detail: update }]);
  });

  it("preserva o hash de uma projeção de arquivo ao instalar o bridge", async () => {
    const response = await fetch(`${origin}/projection/file`);
    const hash = "#/projection/file?resume=1";
    const { window } = runBridge(await response.text(), response.url + hash);
    expect(window.location.hash).toBe(hash);
  });
});
