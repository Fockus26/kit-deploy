import { describe, expect, test } from "bun:test";
import {
  deploymentBadge,
  formatBytes,
  formatCount,
  formatDuration,
  logTime,
  productionBadge,
  seriesSummary,
} from "../../lib/kit/panel-format";

describe("panel format", () => {
  test("every deployment status has a badge, with its word", () => {
    expect(deploymentBadge("live", "production").status).toBe("active");
    expect(deploymentBadge("live", "preview").status).toBe("ready");
    expect(deploymentBadge("queued", "production").status).toBe("building");
    expect(deploymentBadge("starting", "preview").status).toBe("building");
    expect(deploymentBadge("failed", "production").status).toBe("failed");
    expect(deploymentBadge("superseded", "production").status).toBe("saved");
    expect(deploymentBadge("asleep", "preview").status).toBe("sleeping");
  });

  test("production: none, stopped or serving", () => {
    expect(productionBadge("none")).toEqual({
      status: "sleeping",
      label: "Sin despliegues",
    });
    expect(productionBadge("live", true).label).toBe("Detenido");
    expect(productionBadge("live").status).toBe("active");
    expect(productionBadge("failed").status).toBe("failed");
  });

  test("bytes, durations and counts", () => {
    expect(formatBytes(312 * 1024 * 1024)).toBe("312 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1,5 GB");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(185)).toBe("3 min 05 s");
    expect(formatDuration(3720)).toBe("1 h 02 min");
    expect(formatCount(950)).toBe("950");
    expect(formatCount(12_400)).toBe("12,4 k");
  });

  test("a series in words and a log hour in UTC", () => {
    expect(seriesSummary("CPU", [2, 14, 5], " %")).toBe(
      "CPU, de 2 a 14 % en las últimas 24 h",
    );
    expect(seriesSummary("Errores 5xx", [], "")).toBe(
      "Errores 5xx: sin lecturas en las últimas 24 h",
    );
    expect(logTime("2026-11-17T14:02:11.123456789Z")).toBe("14:02:11");
  });
});
