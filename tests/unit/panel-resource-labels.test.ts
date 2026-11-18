import { describe, expect, test } from "bun:test";
import {
  certText,
  DOMAIN_BADGE,
  daysLeft,
  envListText,
  previewBadge,
  previewsLimitText,
  REDIRECT_OPTIONS,
} from "@/lib/panel/resource-labels";

const NOW = new Date("2026-11-17T12:00:00Z");
const inDays = (d: number) => new Date(+NOW + d * 86_400_000);

describe("envListText", () => {
  test("joins with commas and a final y", () => {
    expect(envListText([])).toBe("");
    expect(envListText(["production"])).toBe("Producción");
    expect(envListText(["production", "preview"])).toBe("Producción y Preview");
    expect(envListText(["production", "preview", "development"])).toBe(
      "Producción, Preview y Desarrollo",
    );
  });
});

describe("certText", () => {
  test("error and not issued", () => {
    expect(certText("error", inDays(40), NOW)).toBe("Error");
    expect(certText("none", null, NOW)).toBe("Sin emitir");
  });

  test("within 14 days it says how many are left", () => {
    expect(certText("soon", inDays(9.5), NOW)).toBe("Vence en 9 días");
    expect(certText("soon", inDays(1.2), NOW)).toBe("Vence en 1 día");
    expect(certText("soon", inDays(0.3), NOW)).toBe("Vence hoy");
    expect(certText("soon", inDays(-2), NOW)).toBe("Vence hoy");
  });

  test("a healthy one says how long it lasts", () => {
    expect(certText("ok", inDays(60), NOW)).toBe("Válido 60 días más");
  });

  test("daysLeft never goes negative", () => {
    expect(daysLeft(inDays(-3), NOW)).toBe(0);
    expect(daysLeft(inDays(14), NOW)).toBe(14);
  });
});

describe("badges", () => {
  test("every domain status has a badge", () => {
    expect(DOMAIN_BADGE).toEqual({
      pending_dns: "verifying",
      issuing: "issuing",
      ready: "ready",
      error: "error",
    });
  });

  test("preview states", () => {
    expect(previewBadge("live")).toBe("active");
    expect(previewBadge("asleep")).toBe("sleeping");
    expect(previewBadge("queued")).toBe("building");
    expect(previewBadge("starting")).toBe("building");
    expect(previewBadge("failed")).toBe("failed");
    expect(previewBadge("superseded")).toBe("saved");
  });

  test("the three redirect options, none first", () => {
    expect(REDIRECT_OPTIONS.map((o) => o.value)).toEqual([
      "none",
      "to_apex",
      "to_www",
    ]);
  });
});

describe("previewsLimitText", () => {
  test("at the limit the oldest goes to sleep", () => {
    expect(previewsLimitText(4, 4)).toEqual({
      title: "4 de 4 encendidos",
      body: "El más antiguo se dormirá en el próximo push.",
    });
  });

  test("below it, the free slots", () => {
    expect(previewsLimitText(3, 4).title).toBe("3 de 4 encendidos");
    expect(previewsLimitText(3, 4).body).toStartWith("Queda 1 hueco");
    expect(previewsLimitText(1, 4).body).toStartWith("Quedan 3 huecos");
  });
});
