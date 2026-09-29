import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AppMenuDev from "@/layout/shell/AppMenuDev.vue";
import { KEYS } from "@/constants/UserDataKeys";

const preferences = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/helpers/UserData", () => ({
  default: {
    get: (key: string, fallback: unknown) => preferences.get(key) ?? fallback,
    set: (key: string, value: unknown) => preferences.set(key, value),
  },
}));
vi.mock("@/helpers/Platform", () => ({ default: {} }));
vi.mock("@/helpers/Storage", () => ({ default: {} }));
vi.mock("@/helpers/Broadcast", () => ({ default: {} }));
vi.mock("@/components/ui", () => ({ LjIcon: { template: "<span />" } }));

afterEach(() => preferences.clear());

describe("DEV menu preferences", () => {
  it("shows automatic DevTools disabled when no preference has been saved", () => {
    const wrapper = mount(AppMenuDev, { global: { mocks: { $t: (key: string) => key } } });
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]');
    expect(inputs[0].element.checked).toBe(false);
    expect(inputs[1].element.checked).toBe(false);
    expect(inputs[2].element.checked).toBe(false);
    wrapper.unmount();
  });

  it("shows saved settings and persists changes to the keys consumed by Electron", async () => {
    const keys = [
      KEYS.OPTIONS.DEV.DEVTOOLS_MAIN_WINDOW,
      KEYS.OPTIONS.DEV.DEVTOOLS_PROJECTIONS,
      KEYS.OPTIONS.DEV.ALLOW_HTTP_ROOT,
    ];
    keys.forEach((key) => preferences.set(key, true));
    const wrapper = mount(AppMenuDev, { global: { mocks: { $t: (key: string) => key } } });
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]');
    for (const [index, key] of keys.entries()) {
      expect(inputs[index].element.checked).toBe(true);
      await inputs[index].setValue(false);
      expect(preferences.get(key)).toBe(false);
      await inputs[index].setValue(true);
      expect(preferences.get(key)).toBe(true);
    }
    wrapper.unmount();
  });
});
