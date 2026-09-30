import { describe, expect, it } from "vitest";
import { contextualPages } from "../manifest";
import { KEYS } from "@/constants/UserDataKeys";
import {
  createTransitionContext,
  TRANSITION_TYPE_OPTIONS,
} from "@/config/Transitions";
import type { RibbonButton } from "@/types/Ribbon";

const ctx = createTransitionContext(KEYS.MODULES.ANNOUNCEMENTS);
const TYPE_PATH = ctx.typeKey;

function buttons(): RibbonButton[] {
  return (contextualPages[0].groups[0].buttons ?? []) as RibbonButton[];
}

describe("announcements ribbon transition page", () => {
  it("declares exactly one conditional select per effect, coherent with the table", () => {
    const list = buttons();
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
});
