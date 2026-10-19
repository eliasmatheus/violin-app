// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Module, { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

/**
 * `files/pptx` guarda os PDFs gerados a partir de PowerPoint. A Biblioteca de
 * Mídia aponta para eles, e eles não vêm do servidor: nenhuma limpeza do
 * acervo baixado (clearFiles, clearUnused, enforceQuota) pode apagá-los.
 */
const require = createRequire(import.meta.url);
const fs = require("fs-extra");
let base, filesDir, storage;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "lj-storage-pptx-"));
  filesDir = path.join(base, "files");
  const pathsModule = require.resolve("../paths.js");
  require.cache[pathsModule] = {
    id: pathsModule,
    filename: pathsModule,
    loaded: true,
    exports: {
      dataDir: () => base,
      dataDirIssue: () => null,
      profileRestartRequired: () => false,
      filesDir: () => filesDir,
      jsonCacheDir: () => path.join(base, "json_db"),
    },
  };
  const originalLoad = Module._load;
  Module._load = function (request, ...args) {
    return request === "electron" ? { shell: {} } : originalLoad.call(this, request, ...args);
  };
  try {
    delete require.cache[require.resolve("../storage.js")];
    storage = require("../storage.js");
  } finally {
    Module._load = originalLoad;
  }
});

afterEach(async () => {
  await fs.remove(base);
});

const arquivo = (rel, bytes) => fs.outputFile(path.join(filesDir, rel), "x".repeat(bytes));
const existe = (rel) => fs.pathExists(path.join(filesDir, rel));
const PDF = "pptx/abc-123-powerpoint.pdf";

describe("storage — os PDFs de PowerPoint não são sobra do acervo", () => {
  it("clearFiles apaga o acervo e preserva files/pptx", async () => {
    await arquivo("musica.mp3", 10);
    await arquivo(PDF, 100);
    await storage.clearFiles();
    expect(await existe("musica.mp3")).toBe(false);
    expect(await existe(PDF)).toBe(true);
  });

  it("clearUnused não apaga o PDF por não estar na lista do servidor", async () => {
    await arquivo("sobra.mp3", 10);
    await arquivo(PDF, 100);
    await storage.clearUnused([]);
    expect(await existe("sobra.mp3")).toBe(false);
    expect(await existe(PDF)).toBe(true);
  });

  it("enforceQuota não conta nem remove o PDF", async () => {
    await arquivo(PDF, 1000);
    await arquivo("musica.mp3", 10);
    const r = await storage.enforceQuota(50);
    expect(r.removed).toBe(0);
    expect(await existe(PDF)).toBe(true);
  });
});
