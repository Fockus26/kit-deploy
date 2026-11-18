import { describe, expect, test } from "bun:test";
import { confirmMatches } from "@/lib/kit/confirm";
import { isAtBottom, shouldAutoPause } from "@/lib/kit/log-follow";
import { meterLevel, meterPercent } from "@/lib/kit/meter";
import { formatRelative } from "@/lib/kit/relative-time";

const now = new Date(2026, 10, 17, 15, 0, 0);
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("formatRelative", () => {
  test("seconds, minutes, hours", () => {
    expect(formatRelative(ago(10_000), now)).toBe("hace unos segundos");
    expect(formatRelative(ago(14 * MIN), now)).toBe("hace 14 min");
    expect(formatRelative(ago(3 * HOUR), now)).toBe("hace 3 h");
  });
  test("yesterday and days, by calendar day", () => {
    expect(formatRelative(new Date(2026, 10, 16, 23, 0), now)).toBe("ayer");
    expect(formatRelative(new Date(2026, 10, 14, 9, 0), now)).toBe(
      "hace 3 días",
    );
  });
  test("past 30 days it is a date", () => {
    expect(formatRelative(new Date(2026, 8, 1), now)).toMatch(/2026/);
  });
  test("future", () => {
    expect(formatRelative(new Date(now.getTime() + 5 * MIN), now)).toBe(
      "en 5 min",
    );
    expect(formatRelative(new Date(2026, 10, 18, 9, 0), now)).toBe("mañana");
  });
});

describe("meter", () => {
  test("thresholds 85 / 95", () => {
    expect(meterLevel(84.9, 100)).toBe("normal");
    expect(meterLevel(85, 100)).toBe("warning");
    expect(meterLevel(94.9, 100)).toBe("warning");
    expect(meterLevel(95, 100)).toBe("critical");
    expect(meterLevel(120, 100)).toBe("critical");
  });
  test("percent is clamped and safe", () => {
    expect(meterPercent(5, 0)).toBe(0);
    expect(meterPercent(-1, 10)).toBe(0);
    expect(meterPercent(20, 10)).toBe(100);
  });
});

describe("confirmMatches", () => {
  test("exact, case and whitespace sensitive", () => {
    expect(confirmMatches("maranatha", "maranatha")).toBe(true);
    expect(confirmMatches("Maranatha", "maranatha")).toBe(false);
    expect(confirmMatches("maranatha ", "maranatha")).toBe(false);
    expect(confirmMatches("", "")).toBe(false);
  });
});

describe("log follow", () => {
  const at = { scrollTop: 900, scrollHeight: 1000, clientHeight: 100 };
  const up = { scrollTop: 400, scrollHeight: 1000, clientHeight: 100 };
  test("bottom detection with tolerance", () => {
    expect(isAtBottom(at)).toBe(true);
    expect(isAtBottom({ ...at, scrollTop: 880 })).toBe(true);
    expect(isAtBottom(up)).toBe(false);
  });
  test("auto-pause only when following and scrolled up", () => {
    expect(shouldAutoPause(true, up)).toBe(true);
    expect(shouldAutoPause(true, at)).toBe(false);
    expect(shouldAutoPause(false, up)).toBe(false);
  });
});
