import { describe, expect, test } from "bun:test";
import type { ProjectRemoval } from "../../agent/project-remove";
import type { AgentClient } from "../../cli/client";
import { AgentUnreachable } from "../../cli/client";
import { type CliContext, runCli } from "../../cli/commands";
import type { AuditEntry } from "../../lib/db/audit";
import type {
  ProjectFootprint,
  ProjectRemovalStore,
} from "../../lib/db/project-remove";
import { alertCheckKeys } from "../../lib/db/project-remove";

const ROWS: ProjectFootprint = {
  repo: "Fockus26/kd-hello",
  deployments: 4,
  previews: 1,
  hosts: ["kd-hello.fockus.dev"],
  variables: 2,
  tokens: 1,
  cronJobs: 0,
  openAlerts: 1,
};

const machine = (over: Partial<ProjectRemoval> = {}): ProjectRemoval => ({
  project: "kd_hello",
  dryRun: true,
  sites: ["/etc/caddy/sites/kd_hello.caddy"],
  containers: [{ name: "kd_hello-prod-abc1234", state: "running" }],
  images: ["ghcr.io/fockus26/kd-hello:abc1234"],
  pin: "/etc/kit-deploy/images/kd_hello",
  databases: [
    { database: "kd_hello", exists: true, managed: true },
    { database: "kd_hello_preview", exists: false, managed: false },
  ],
  skipped: [],
  failed: [],
  ...over,
});

const EMPTY = machine({
  sites: [],
  containers: [],
  images: [],
  pin: null,
  databases: [
    { database: "kd_hello", exists: false, managed: false },
    { database: "kd_hello_preview", exists: false, managed: false },
  ],
});

function setup(
  opts: {
    rows?: ProjectFootprint | null;
    agent?: (dryRun: boolean) => ProjectRemoval | Error;
    root?: boolean;
  } = {},
) {
  let rows = opts.rows === undefined ? ROWS : opts.rows;
  const events: string[] = [];
  const audits: AuditEntry[] = [];
  const store: ProjectRemovalStore = {
    async footprint() {
      return rows;
    },
    async remove(_p, audit) {
      events.push("rows");
      if (!rows) return false;
      rows = null;
      audits.push(audit);
      return true;
    },
    async record(audit) {
      audits.push(audit);
    },
  };
  const client: AgentClient = {
    async call(op, params) {
      const { dryRun } = params as { dryRun: boolean };
      events.push(`${op}${dryRun ? " (dry run)" : ""}`);
      const r = (opts.agent ?? ((d) => machine({ dryRun: d })))(dryRun);
      if (r instanceof AgentUnreachable) throw r;
      if (r instanceof Error)
        return {
          id: "x",
          ok: false,
          error: { code: "invalid_config", message: r.message },
        };
      return { id: "x", ok: true, result: r };
    },
  };
  const ctx: CliContext = {
    removal: () => store,
    actor: "ssh:cesar",
    pins: { isRoot: opts.root ?? true, write: async () => {} },
  };
  const run = (...argv: string[]) =>
    runCli(["project", "rm", ...argv], client, ctx);
  return { run, events, audits };
}

describe("project rm — without --yes", () => {
  test("says what it would remove, keeps the databases, changes nothing, exit 0", async () => {
    const { run, events, audits } = setup();
    const r = await run("kd_hello");
    expect(r.code).toBe(0);
    expect(events).toEqual(["project.remove (dry run)"]);
    expect(audits).toEqual([]);
    expect(r.out).toContain("kd_hello: would remove\n");
    expect(r.out).toContain(
      "  rows        project kd_hello (Fockus26/kd-hello), 4 deployments (1 preview), 1 domain (kd-hello.fockus.dev), 2 variables, 1 deploy token, 0 cron jobs, 1 open alert (closed, no email)\n",
    );
    expect(r.out).toContain("  caddy       /etc/caddy/sites/kd_hello.caddy\n");
    expect(r.out).toContain("  containers  kd_hello-prod-abc1234 (running)\n");
    expect(r.out).toContain("  pin         /etc/kit-deploy/images/kd_hello\n");
    // Only the database that exists, with the marker only when kit-deploy's.
    expect(r.out).toContain(
      "    kit-db drop kd_hello --yes && rm /etc/kit-deploy/dbs/kd_hello\n",
    );
    expect(r.out).not.toContain("kit-db drop kd_hello_preview");
    expect(r.out).toContain("Re-run with --yes");
  });

  test("--json carries the rows and the machine's plan", async () => {
    const { run } = setup();
    const r = await run("kd_hello", "--json");
    expect(JSON.parse(r.out)).toMatchObject({
      project: "kd_hello",
      dryRun: true,
      rows: ROWS,
      machine: { pin: "/etc/kit-deploy/images/kd_hello" },
    });
  });
});

describe("project rm --yes", () => {
  test("rows first, then the machine; one audit row with the repo, never a value", async () => {
    const { run, events, audits } = setup();
    const r = await run("kd_hello", "--yes");
    expect(r.code).toBe(0);
    expect(events).toEqual(["rows", "project.remove"]);
    expect(audits).toEqual([
      {
        actor: "ssh:cesar",
        action: "project.remove",
        project: "kd_hello",
        environment: null,
        name: "Fockus26/kd-hello",
      },
    ]);
    expect(r.out).toStartWith(
      "removed kd_hello:\n  rows        project kd_hello",
    );
    expect(r.out).toContain("kit-deploy never drops one");
  });

  test("twice: the second run says it is already gone, exit 0, no second audit row", async () => {
    const { run, audits } = setup({ agent: () => EMPTY });
    await run("kd_hello", "--yes");
    const again = await run("kd_hello", "--yes");
    expect(again.code).toBe(0);
    expect(again.out).toStartWith(
      "nothing to remove for kd_hello: already gone\n",
    );
    expect(again.out).toContain("no kit-db database named kd_hello");
    expect(audits).toHaveLength(1);
  });

  test("leftovers on the machine with no rows are removed and audited", async () => {
    const { run, audits, events } = setup({ rows: null });
    const r = await run("kd_hello", "--yes");
    expect(r.code).toBe(0);
    expect(events).toEqual(["project.remove"]);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.name).toBeNull();
    expect(r.out).not.toContain("  rows ");
  });

  test("a failed step: exit 1, listed, and how to retry", async () => {
    const { run } = setup({
      agent: () =>
        machine({
          failed: ["kd_hello-prod-abc1234: docker rm failed: busy"],
          pin: null,
        }),
    });
    const r = await run("kd_hello", "--yes");
    expect(r.code).toBe(1);
    expect(r.out).toContain(
      "failed:\n  kd_hello-prod-abc1234: docker rm failed: busy\n",
    );
    expect(r.out).toContain(
      "run it again (kit-deploy project rm kd_hello --yes)",
    );
  });

  test("kit-agent refusing after the rows went: exit 1 and the retry command", async () => {
    const { run } = setup({
      agent: () => new Error("caddy validate failed: x"),
    });
    const r = await run("kd_hello", "--yes");
    expect(r.code).toBe(1);
    expect(r.out).toBe("removed kd_hello's rows\n");
    expect(r.err).toContain(
      "kit-agent: invalid_config: caddy validate failed: x",
    );
    expect(r.err).toContain("kit-deploy project rm kd_hello --yes");
  });

  test("kit-agent unreachable: the same", async () => {
    const { run } = setup({
      agent: () => new AgentUnreachable("cannot reach kit-agent"),
    });
    const r = await run("kd_hello", "--yes");
    expect(r.code).toBe(1);
    expect(r.err).toContain("cannot reach kit-agent");
  });
});

describe("project rm — refusals", () => {
  test("not root, reserved or _preview names, bad usage: nothing runs", async () => {
    const cases: Array<[string[], boolean, number, string]> = [
      [["kd_hello", "--yes"], false, 1, "project rm needs root"],
      [["kit_deploy", "--yes"], true, 2, "reserved"],
      [["shop_preview"], true, 2, "_preview is the suffix"],
      [[], true, 2, "usage: kit-deploy project rm"],
      [["kd_hello", "--force"], true, 2, "unknown option --force"],
      [["a", "b"], true, 2, "usage: kit-deploy project rm"],
    ];
    for (const [argv, root, code, msg] of cases) {
      const { run, events } = setup({ root });
      const r = await run(...argv);
      expect(r.code).toBe(code);
      expect(r.err).toContain(msg);
      expect(events).toEqual([]);
    }
  });
});

test("alert check keys: the project's own and its hosts' certificates", () => {
  expect(alertCheckKeys("kd_hello", ["kd-hello.fockus.dev"])).toEqual([
    "site_down:kd_hello",
    "deploy_failed:kd_hello",
    "cert:kd-hello.fockus.dev",
  ]);
});
