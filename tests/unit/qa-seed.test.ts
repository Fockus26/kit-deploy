import { describe, expect, test } from "bun:test";
import { containerNameSchema } from "../../agent/protocol";
import { assertEnvName } from "../../lib/core/env";
import { assertHost } from "../../lib/core/validate";
import { previewsOf } from "../../lib/panel/data/projects";
import { seedMetrics, seedRows } from "../../scripts/qa-seed";

const NOW = Date.parse("2026-11-17T12:00:00Z");

describe("qa-seed: demo rows the database accepts, one per state", () => {
  const seed = seedRows(NOW);

  test("maranatha: 5 production deployments in distinct states, 3 previews", () => {
    const prod = seed.deployments.filter(
      (d) => d.project === "maranatha" && d.environment === "production",
    );
    expect(prod).toHaveLength(5);
    expect(new Set(prod.map((d) => d.status))).toEqual(
      new Set(["starting", "live", "failed", "superseded"]),
    );
    const prs = seed.deployments.filter((d) => d.environment === "preview");
    expect(prs.map((d) => d.status).sort()).toEqual([
      "asleep",
      "live",
      "queued",
    ]);
    for (const d of seed.deployments) {
      expect(d.sha).toMatch(/^[0-9a-f]{40}$/);
      expect((d.environment === "preview") === (d.pr !== null)).toBe(true);
      if (d.container)
        expect(containerNameSchema.safeParse(d.container).success).toBe(true);
    }
    // One open deployment per commit (deployments_open_commit).
    const open = seed.deployments.filter((d) =>
      ["queued", "starting", "live"].includes(d.status),
    );
    expect(new Set(open.map((d) => `${d.project}/${d.pr}/${d.sha}`)).size).toBe(
      open.length,
    );
  });

  test("the previews read as the panel will show them", () => {
    const rows = seed.deployments
      .filter((d) => d.project === "maranatha")
      .map((d, i) => ({
        ...d,
        id: `d${i}`,
        projectId: "p",
        generation: 1,
        image: "x",
      }));
    expect(previewsOf("maranatha", rows)).toMatchObject({
      running: 1,
      limit: 4,
    });
  });

  test("a domain in each status, and a certificate near expiry", () => {
    const mine = seed.domains.filter((d) => d.project === "maranatha");
    expect(new Set(mine.map((d) => d.status))).toEqual(
      new Set(["pending_dns", "issuing", "ready", "error"]),
    );
    expect(mine).toHaveLength(5);
    for (const d of seed.domains) expect(assertHost(d.host)).toBe(d.host);
    expect(
      mine.some(
        (d) => d.certNotAfter && +d.certNotAfter - NOW < 14 * 86_400_000,
      ),
    ).toBe(true);
  });

  test("variable names are settable; NEXT_PUBLIC_* is never secret", () => {
    for (const v of seed.vars) {
      expect(assertEnvName(v.name)).toBe(v.name);
      if (v.name.startsWith("NEXT_PUBLIC_")) expect(v.secret).toBe(false);
    }
  });

  test("24 h of metrics per subject", () => {
    const rows = seedMetrics(NOW, "maranatha-prod-a3f9c21a3f9c");
    expect(rows).toHaveLength(3 * 24 * 60);
    expect(
      rows.every((r) => r.scope === "vps" || r.project === "maranatha"),
    ).toBe(true);
  });
});
