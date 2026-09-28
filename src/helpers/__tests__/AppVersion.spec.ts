import { describe, expect, it } from "vitest";
import { normalizeAppVersion } from "../AppVersion.js";

describe("normalizeAppVersion", () => {
  it.each([
    ["2.0.0", "2.0.0"],
    ["v2.0.0-beta.13", "2.0.0-beta.13"],
    ["  v2.0.0-beta.13  ", "2.0.0-beta.13"],
    ["0.0.0", "0.0.0"],
    ["2.0.0-0", "2.0.0-0"],
    ["2.0.0-01a", "2.0.0-01a"],
    ["2.0.0-beta.13+build.001", "2.0.0-beta.13+build.001"],
  ])("normaliza a versão válida %j", (value, expected) => {
    expect(normalizeAppVersion(value)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    13,
    {},
    "",
    "main",
    "vmain",
    "refs/heads/main",
    "unknown",
    "2.0",
    "2.0.0.1",
    "02.0.0",
    "2.00.0",
    "2.0.00",
    "2.0.0-beta.01",
    "2.0.0-01",
    "2.0.0-beta..13",
    "2.0.0+",
    "2.0.0-",
  ])("rejeita valores que não são SemVer (%j)", (value) => {
    expect(normalizeAppVersion(value)).toBe("");
  });
});
