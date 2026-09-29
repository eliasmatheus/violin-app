import { describe, expect, it } from "vitest";
import { contextualPages } from "../manifest";
import { KEYS } from "@/constants/UserDataKeys";
import {
  createTransitionContext,
  TRANSITION_TYPE_OPTIONS,
} from "@/config/Transitions";
import type { RibbonButton, RibbonPage } from "@/types/Ribbon";

const ctx = createTransitionContext(KEYS.MODULES.MEDIA_LIBRARY);
const TYPE_PATH = ctx.typeKey;

/** O grupo de transições é o único da página cujo id termina em `_transitions`. */
function buttons(): RibbonButton[] {
  const page = contextualPages.find((p: RibbonPage) =>
    p.groups.some((g) => g.id.endsWith("_transitions")),
  );
  const group = page?.groups.find((g) => g.id.endsWith("_transitions"));
  return (group?.buttons ?? []) as RibbonButton[];
}

describe("media library ribbon transition page", () => {
  it("declares exactly one conditional select per effect, coherent with the table", () => {
    const list = buttons();
    expect(list.length).toBeGreaterThan(0);
    for (const [effect, p] of Object.entries(ctx.params)) {
      const matches = list.filter((b) => b.optionKey === p.key);
      expect(matches, `efeito ${effect}`).toHaveLength(1);
      const btn = matches[0];
      expect(btn.type).toBe("select");
      expect(btn.label).toBe(p.label);
      expect(btn.defaultValue).toBe(p.def);
      expect(btn.options?.map((o) => o.value)).toEqual(p.options.map((o) => o.value));
      expect(btn.dependsOnOption).toEqual({ path: TYPE_PATH, value: effect });
    }
  });

  it("keeps effect, duration and curve without dependencies", () => {
    const list = buttons();
    const type = list.find((b) => b.optionKey === TYPE_PATH);
    expect(type?.dependsOnOption).toBeUndefined();
    expect(type?.options?.map((o) => o.value)).toEqual(
      TRANSITION_TYPE_OPTIONS.map((o) => o.value),
    );

    const duration = list.find((b) => b.optionKey === ctx.durationKey);
    expect(duration?.dependsOnOption).toBeUndefined();

    const ease = list.find((b) => b.optionKey === ctx.easeParam.key);
    expect(ease?.type).toBe("select");
    expect(ease?.dependsOnOption).toBeUndefined();
  });

  it("shows the zoom origin only while the zoom effect is active", () => {
    const origin = buttons().find((b) => b.optionKey === ctx.zoomOriginParam.key);
    expect(origin?.dependsOnOption).toEqual({ path: TYPE_PATH, value: "zoom" });
  });

  it("has no custom component buttons in the contextual page", () => {
    expect(buttons().some((b) => !!b.customButton)).toBe(false);
  });

  it("uses the module's own storage keys, independent from announcements", () => {
    expect(TYPE_PATH).toBe(KEYS.MODULES.MEDIA_LIBRARY.TRANSITION_TYPE);
    expect(TYPE_PATH).not.toBe(KEYS.MODULES.ANNOUNCEMENTS.TRANSITION_TYPE);
    for (const p of Object.values(ctx.params)) {
      expect(p.key.startsWith(KEYS.MODULES.MEDIA_LIBRARY.TRANSITION_OPTIONS.ROOT)).toBe(true);
    }
  });
});
