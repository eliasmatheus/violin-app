import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { KEYS } from "@/constants/UserDataKeys";
import {
  createTransitionButtons,
  createTransitionContext,
  readTransitionParam,
  TRANSITION_TYPES,
  TRANSITION_TYPE_OPTIONS,
} from "@/config/Transitions";

const PT = JSON.parse(readFileSync("src/lang/pt.json", "utf8"));
const ES = JSON.parse(readFileSync("src/lang/es.json", "utf8"));

function resolvida(dicionario: unknown, chave: string): boolean {
  return (
    chave.split(".").reduce<unknown>(
      (no, parte) => (no == null ? no : (no as Record<string, unknown>)[parte]),
      dicionario,
    ) !== undefined
  );
}

const ctx = createTransitionContext(KEYS.MODULES.ANNOUNCEMENTS);

describe("shared transition table", () => {
  it("every option and param label resolves in the main lang files", () => {
    const labels = [
      ...TRANSITION_TYPE_OPTIONS.map((o) => o.label),
      ctx.easeParam.label,
      ctx.zoomOriginParam.label,
      ...Object.values(ctx.params).flatMap((p) => [
        p.label,
        ...p.options.map((o) => o.label),
      ]),
    ];
    expect(labels.length).toBeGreaterThan(40);
    for (const label of labels) {
      expect(resolvida(PT, label), `pt: ${label}`).toBe(true);
      expect(resolvida(ES, label), `es: ${label}`).toBe(true);
    }
  });

  it("button ids are namespaced per module", () => {
    const ann = createTransitionButtons("ann", ctx);
    const media = createTransitionButtons("media", ctx);
    expect(ann.map((b) => b.id)).not.toEqual(media.map((b) => b.id));
    expect(ann.every((b) => b.id.startsWith("ann_"))).toBe(true);
    expect(media.every((b) => b.id.startsWith("media_"))).toBe(true);
    expect(ann.length).toBe(media.length);
    // Efeito, Duração, Curva + 7 efeitos + origem do zoom
    expect(ann.length).toBe(3 + Object.keys(ctx.params).length + 1);
  });

  it("type options cover every transition type", () => {
    expect(TRANSITION_TYPE_OPTIONS.map((o) => o.value)).toEqual([...TRANSITION_TYPES]);
  });

  it("readTransitionParam rejects garbage and falls back to the default", () => {
    const p = ctx.params.slide;
    expect(readTransitionParam(p, "vertical")).toBe("vertical");
    expect(readTransitionParam(p, "lixo")).toBe(p.def);
    expect(readTransitionParam(p, 42)).toBe(p.def);
    expect(readTransitionParam(p, undefined)).toBe(p.def);
  });
});
