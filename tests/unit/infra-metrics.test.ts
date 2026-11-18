import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(f, "utf8");

describe("kit-deploy-metrics.{service,timer}", () => {
  test("every 30 s, to the second, running the CLI's collect after kit-agent", () => {
    const timer = read("infra/kit-deploy-metrics.timer");
    expect(timer).toMatch(/^OnUnitActiveSec=30s$/m);
    expect(timer).toMatch(/^AccuracySec=1s$/m);
    expect(timer).toMatch(/^Unit=kit-deploy-metrics\.service$/m);
    const svc = read("infra/kit-deploy-metrics.service");
    expect(svc).toMatch(
      /^ExecStart=\/usr\/local\/bin\/kit-deploy metrics collect$/m,
    );
    expect(svc).toMatch(/^Type=oneshot$/m);
    expect(svc).toMatch(/^Requires=kit-agent\.service$/m);
    // Shorter than the period: a stuck run never overlaps the next one.
    expect(svc).toMatch(/^TimeoutStartSec=25s$/m);
  });

  test("the release ships the units update.sh installs", () => {
    const release = read("scripts/release.sh");
    const update = read("infra/update.sh");
    for (const u of [
      "kit-deploy-metrics.service",
      "kit-deploy-metrics.timer",
    ]) {
      expect(release).toContain(`infra/${u}`);
      expect(update).toContain(u);
    }
    expect(update).toContain(
      "systemctl enable -q --now kit-deploy-metrics.timer",
    );
  });
});
