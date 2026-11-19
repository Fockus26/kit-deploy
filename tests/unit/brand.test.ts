import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BRAND } from "../../lib/brand";

const css = readFileSync("app/globals.css", "utf8");
const TOKENS = {
  background: ["background", 1],
  surface: ["card", 1],
  primary: ["primary", 1],
  foreground: ["foreground", 1],
  muted: ["muted-foreground", 1],
} as const;

describe("brand", () => {
  test("colours match app/globals.css' dark theme", () => {
    for (const [key, [token]] of Object.entries(TOKENS)) {
      const m = new RegExp(
        `--${token}: light-dark\(#[0-9a-f]{6}, (#[0-9a-f]{6})\)`,
      ).exec(css);
      expect(m?.[1]).toBe(BRAND[key as keyof typeof TOKENS]);
    }
  });

  test("theme-color light matches the light background", () => {
    const m = /--background: light-dark\((#[0-9a-f]{6})/.exec(css);
    expect(m?.[1]).toBe(BRAND.backgroundLight);
  });

  test("icon.svg uses the brand colours", () => {
    const svg = readFileSync("app/icon.svg", "utf8");
    expect(svg).toContain(BRAND.background);
    expect(svg).toContain(BRAND.primary);
  });
});
