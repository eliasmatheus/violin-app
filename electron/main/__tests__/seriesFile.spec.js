// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import os from "os";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const series = require("../seriesFile.js");

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "lj-series-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const doc = (plays, extra = {}) => ({
  version: 1,
  active: true,
  name: "Momento Saúde",
  onEnd: "restart",
  cycle: 1,
  updatedAt: "2026-10-01T10:00:00Z",
  plays,
  ...extra,
});
const play = (id, file, at, extra = {}) => ({ id, file, at, cycle: 1, ...extra });

describe("seriesFile", () => {
  it("pasta sem série devolve null; caminho relativo é recusado", async () => {
    expect(await series.read(dir)).toEqual({ ok: true, series: null, versions: [] });
    expect((await series.read("relativo")).ok).toBe(false);
    expect((await series.write("relativo", doc([]))).ok).toBe(false);
  });

  it("grava na própria pasta e lê de volta", async () => {
    const res = await series.write(dir, doc([play("a", "01.mp4", "2026-09-24T19:30:00Z")]));
    expect(res.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, series.FILE_NAME))).toBe(true);
    expect((await series.read(dir)).series.plays.map((p) => p.file)).toEqual(["01.mp4"]);
  });

  it("dois computadores gravando: as exibições se somam e desmarcar vence", async () => {
    await series.write(dir, doc([play("a", "01.mp4", "2026-09-24T19:30:00Z")]));
    // O outro computador não viu "a", e passou "b".
    await series.write(dir, doc([play("b", "02.mp4", "2026-09-27T19:30:00Z")]));
    // Um terceiro desmarca "a".
    const res = await series.write(dir, doc([play("a", "01.mp4", "2026-09-24T19:30:00Z", { undone: true })]));
    expect(res.series.plays).toEqual([
      play("a", "01.mp4", "2026-09-24T19:30:00Z", { undone: true }),
      play("b", "02.mp4", "2026-09-27T19:30:00Z"),
    ]);
  });

  it("o ciclo só anda para frente e as configurações seguem a gravação mais nova", async () => {
    await series.write(dir, doc([], { cycle: 3, updatedAt: "2026-10-02T00:00:00Z", name: "Novo" }));
    const res = await series.write(dir, doc([], { cycle: 2, updatedAt: "2026-10-01T00:00:00Z" }));
    expect(res.series.cycle).toBe(3);
    expect(res.series.name).toBe("Novo");
  });

  it("encontra as cópias em conflito do OneDrive e descreve cada versão", async () => {
    await series.write(dir, doc([play("a", "01.mp4", "2026-09-24T19:30:00Z")]));
    fs.writeFileSync(
      path.join(dir, ".louvorja-serie-IGREJA-PC.json"),
      JSON.stringify(doc([play("b", "02.mp4", "2026-09-27T19:30:00Z"), play("c", "03.mp4", "2026-09-28T19:30:00Z")]))
    );
    const res = await series.read(dir);
    expect(res.versions.map((v) => v.name)).toEqual([series.FILE_NAME, ".louvorja-serie-IGREJA-PC.json"]);
    expect(res.versions[1]).toMatchObject({ plays: 2, lastPlay: { file: "03.mp4", at: "2026-09-28T19:30:00Z" } });
  });

  it("juntar todas: nenhuma exibição se perde e as cópias saem da pasta", async () => {
    await series.write(dir, doc([play("a", "01.mp4", "2026-09-24T19:30:00Z")]));
    const copy = path.join(dir, ".louvorja-serie-IGREJA-PC.json");
    fs.writeFileSync(copy, JSON.stringify(doc([play("b", "02.mp4", "2026-09-27T19:30:00Z")])));
    const res = await series.resolve(dir, "merge");
    expect(res.series.plays.map((p) => p.file)).toEqual(["01.mp4", "02.mp4"]);
    expect(fs.existsSync(copy)).toBe(false);
    expect((await series.read(dir)).versions).toEqual([]);
  });

  it("usar uma versão: ela vira a principal; nome fora da lista é recusado", async () => {
    await series.write(dir, doc([play("a", "01.mp4", "2026-09-24T19:30:00Z")]));
    fs.writeFileSync(path.join(dir, ".louvorja-serie-IGREJA-PC.json"), JSON.stringify(doc([play("b", "02.mp4", "2026-09-27T19:30:00Z")])));
    expect((await series.resolve(dir, "../outro.json")).ok).toBe(false);
    const res = await series.resolve(dir, ".louvorja-serie-IGREJA-PC.json");
    expect(res.series.plays.map((p) => p.file)).toEqual(["02.mp4"]);
  });

  it("descarta o que o formato não conhece", () => {
    const n = series.normalize({ name: 5, onEnd: "x", plays: [{ id: 1 }, play("a", "f", "t")], extra: 1 });
    expect(n).toMatchObject({ name: "", onEnd: "restart", cycle: 1, plays: [play("a", "f", "t")] });
    expect(n.extra).toBeUndefined();
  });
});
