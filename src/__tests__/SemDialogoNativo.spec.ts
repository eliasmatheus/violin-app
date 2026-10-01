import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No Electron para Windows, window.confirm/alert deixam os campos de texto sem
 * teclado até a janela perder e retomar o foco: o operador teve de reiniciar o
 * app no meio do culto. As perguntas passam por `$alert.confirm`/`$alert.message`.
 */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(path);
    return /\.(vue|ts|js)$/.test(entry.name) && !/\.spec\./.test(entry.name) ? [path] : [];
  });
}

describe("diálogos nativos", () => {
  it("nenhuma tela chama window.confirm, alert ou prompt", () => {
    const native = /(?<![.\w$])(?:window\.)?(?:confirm|alert|prompt)\(/;
    // Alert.js declara os métodos de mesmo nome que substituem os nativos.
    const files = sources("src").filter((path) => !path.endsWith(join("helpers", "Alert.js")));
    const offenders = files.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ line, at: `${path}:${index + 1}` }))
        .filter(({ line }) => native.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
        .map(({ at }) => at)
    );
    expect(offenders).toEqual([]);
  });
});
