import { describe, expect, test } from "bun:test";
import { type AgentClient, AgentUnreachable } from "../../cli/client";
import type { CronJob } from "../../lib/cron/run";
import type { MetricsReader } from "../../lib/metrics/read";
import { setVariable } from "../../lib/ops/env";
import type { PanelDeps } from "../../lib/panel/data/deps";
import {
  previewsOf,
  readDeployments,
  readHome,
  readProjectOverview,
} from "../../lib/panel/data/projects";
import {
  auditPaging,
  readCron,
  readDatabases,
  readDomains,
  readEnvList,
  readLogFilters,
  readLogsTail,
  readSettings,
} from "../../lib/panel/data/resources";
import {
  AUDIT_PAGE,
  type AuditRow,
  type DeploymentRow,
  type PanelStore,
  type ProjectRow,
} from "../../lib/panel/data/store";
import { memoryAlertStore } from "./alerts-fakes";
import { domainRow, domainWorld, T0 } from "./domain-fakes";
import { memoryEnv, memoryTokens, realAgent, USER } from "./panel-fakes";

const SECRET = "sk_live_panel_never_leaves_the_agent_000";
const PROJECT: ProjectRow = {
  id: "p1",
  name: "kd_hello",
  repo: "fockus26/kd-hello",
  productionBranch: "main",
  memoryMb: 512,
  createdAt: new Date(T0 - 86_400_000),
};

let n = 0;
function dep(over: Partial<DeploymentRow>): DeploymentRow {
  n++;
  return {
    id: `d${n}`,
    projectId: "p1",
    environment: "production",
    pr: null,
    sha: String(n % 10).repeat(40),
    generation: 1,
    image: "ghcr.io/fockus26/kd-hello:x",
    status: "superseded",
    container: null,
    port: null,
    error: null,
    createdAt: new Date(T0 - (100 - n) * 60_000),
    finishedAt: null,
    ...over,
  };
}

function memoryStore(
  rows: DeploymentRow[],
  projects = [PROJECT],
  audit: AuditRow[] = [],
): PanelStore {
  const byNewest = () => [...rows].sort((a, b) => +b.createdAt - +a.createdAt);
  return {
    async projects() {
      return projects;
    },
    async project(name) {
      return projects.find((p) => p.name === name) ?? null;
    },
    async deployments(projectId, f = {}) {
      return byNewest().filter(
        (d) =>
          d.projectId === projectId &&
          (!f.environment || d.environment === f.environment) &&
          (!f.status || d.status === f.status),
      );
    },
    async productionHeads() {
      const out = new Map<
        string,
        { latest: DeploymentRow | null; live: DeploymentRow | null }
      >();
      for (const p of projects) {
        const prod = byNewest().filter(
          (d) => d.projectId === p.id && d.environment === "production",
        );
        if (prod.length)
          out.set(p.id, {
            latest: prod[0] ?? null,
            live: prod.find((d) => d.status === "live") ?? null,
          });
      }
      return out;
    },
    async deployment(projectId, id) {
      return rows.find((d) => d.projectId === projectId && d.id === id) ?? null;
    },
    async openDeployment() {
      return null;
    },
    async passkeys() {
      return [
        {
          id: "pk1",
          name: "MacBook",
          deviceType: "multiDevice",
          backedUp: true,
          createdAt: new Date(T0),
        },
      ];
    },
    async twoFactorEnabled() {
      return true;
    },
    async audit({ offset = 0, limit = AUDIT_PAGE } = {}) {
      return audit.slice(offset, offset + limit);
    },
    async auditCount() {
      return audit.length;
    },
  };
}

const metrics: MetricsReader = {
  async containers() {
    return [
      {
        name: "kd_hello-prod-aaaaaaaaaaaa",
        project: "kd_hello",
        env: "production",
        at: new Date(T0),
        cpuPct: 3,
        memBytes: 100,
        memLimitBytes: 400,
      },
    ];
  },
  async vps() {
    return {
      at: new Date(T0),
      memUsed: 1,
      memTotal: 8,
      diskUsed: 1,
      diskTotal: 100,
      load1: 0.2,
      cpus: 4,
    };
  },
  async series() {
    return [];
  },
  async totals() {
    return [];
  },
};

const down: AgentClient = {
  async call() {
    throw new AgentUnreachable(
      "cannot reach kit-agent at /run/kit-deploy/agent.sock: ENOENT",
    );
  },
};

function auditRows(n: number): AuditRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    at: new Date(T0 - i * 60_000),
    actor: "web:u1",
    action: "project.stop",
    project: "kd_hello",
    environment: null,
    name: null,
  }));
}

function world(
  opts: {
    agent?: AgentClient;
    rows?: DeploymentRow[];
    audit?: AuditRow[];
  } = {},
) {
  const alerts = memoryAlertStore();
  const cronJobs: CronJob[] = [];
  const env = memoryEnv();
  const domains = domainWorld([], { projects: ["kd_hello"] });
  const deps: PanelDeps = {
    agent: opts.agent ?? realAgent().client,
    store: memoryStore(opts.rows ?? [], [PROJECT], opts.audit ?? []),
    env: env.store,
    domains: domains.deps.store,
    metrics,
    tokens: memoryTokens().store,
    alerts: alerts.reader,
    cron: {
      jobs: async (p) => cronJobs.filter((j) => !p || j.project === p),
      runs: async () => [],
    },
    now: () => T0,
  };
  return { deps, env, domains, alerts, cronJobs };
}

describe("panel data: variables", () => {
  test("secrets have no value field; plain values come from env.reveal; secrets are never sent to it", async () => {
    const a = realAgent();
    const w = world({ agent: a.client });
    const seal = { agent: a.client, store: w.env.store };
    await setVariable(
      seal,
      {
        project: "kd_hello",
        environment: "production",
        name: "API_KEY",
        value: SECRET,
        secret: true,
      },
      "web:u1",
    );
    await setVariable(
      seal,
      {
        project: "kd_hello",
        environment: "production",
        name: "NEXT_PUBLIC_SITE",
        value: "https://kd-hello.fockus.dev",
        secret: false,
      },
      "web:u1",
    );
    await setVariable(
      seal,
      {
        project: "kd_hello",
        environment: "development",
        name: "DEBUG",
        value: "1",
        secret: false,
      },
      "web:u1",
    );
    a.sent.length = 0;
    const data = await readEnvList(w.deps, "kd_hello", "production");
    if (!data) throw new Error("no data");
    expect(data.counts).toEqual({ production: 2, preview: 0, development: 1 });
    expect(data.values).toBe("ok");
    const secret = data.vars.find((v) => v.name === "API_KEY");
    expect(secret).toEqual({
      name: "API_KEY",
      secret: true,
      public: false,
      updatedAt: expect.any(Date),
      updatedBy: "web:u1",
    });
    expect(secret && "value" in secret).toBe(false);
    expect(data.vars.find((v) => v.name === "NEXT_PUBLIC_SITE")).toMatchObject({
      secret: false,
      public: true,
      value: "https://kd-hello.fockus.dev",
    });
    expect(JSON.stringify(data)).not.toContain(SECRET);
    expect(a.sent).toHaveLength(1);
    expect(JSON.stringify(a.sent)).not.toContain("API_KEY");
    expect(data.managed).toContain("DATABASE_URL");
  });

  test("kit-agent down: names still listed, plain values null, typed unavailable", async () => {
    const a = realAgent();
    const w = world({ agent: down });
    await setVariable(
      { agent: a.client, store: w.env.store },
      {
        project: "kd_hello",
        environment: "production",
        name: "PLAIN",
        value: "visible",
        secret: false,
      },
      "web:u1",
    );
    const data = await readEnvList(w.deps, "kd_hello", "production");
    expect(data).toMatchObject({
      values: { unavailable: "agent" },
      vars: [{ name: "PLAIN", secret: false, value: null }],
    });
  });

  test("an unknown project is null (the page's notFound)", async () => {
    expect(await readEnvList(world().deps, "nope", "production")).toBeNull();
  });
});

describe("panel data: project and home", () => {
  const rows = () => [
    dep({
      id: "old",
      status: "superseded",
      container: "kd_hello-prod-bbbbbbbbbbbb",
      port: 20002,
    }),
    dep({
      id: "live",
      status: "live",
      container: "kd_hello-prod-aaaaaaaaaaaa",
      port: 20001,
      finishedAt: new Date(T0 - 10 * 60_000),
    }),
    dep({
      id: "pr7",
      environment: "preview",
      pr: 7,
      status: "live",
      container: "kd_hello-pr-7-cccccccccccc",
      port: 20010,
    }),
    dep({ id: "pr8", environment: "preview", pr: 8, status: "asleep" }),
    dep({ id: "pr9old", environment: "preview", pr: 9, status: "superseded" }),
  ];

  test("overview: live, rollback possible, previews counted, container state from kit-agent", async () => {
    const agent: AgentClient = {
      async call(op) {
        if (op !== "container.list") throw new Error(op);
        return {
          id: "x",
          ok: true,
          result: [{ name: "kd_hello-prod-aaaaaaaaaaaa", state: "running" }],
        };
      },
    };
    const w = world({ agent, rows: rows() });
    const o = await readProjectOverview(w.deps, "kd_hello");
    if (!o) throw new Error("no overview");
    expect(o.production).toBe("live");
    expect(o.live?.id).toBe("live");
    expect(o.container).toEqual({
      name: "kd_hello-prod-aaaaaaaaaaaa",
      state: "running",
    });
    expect(o.canRollback).toBe(true);
    expect(o.previews).toMatchObject({ running: 1, limit: 4 });
    expect(o.previews.previews.map((p) => p.pr)).toEqual([8, 7]);
    expect(o.previews.previews[0]?.url).toBe(
      "https://kd-hello-pr-8.preview.fockus.dev",
    );
    expect(o.recent).toHaveLength(5);
  });

  test("overview with kit-agent down: the container is unavailable, the rest is there", async () => {
    const o = await readProjectOverview(
      world({ agent: down, rows: rows() }).deps,
      "kd_hello",
    );
    expect(o).toMatchObject({
      container: { unavailable: "agent" },
      production: "live",
      canRollback: true,
    });
    expect(await readProjectOverview(world().deps, "nope")).toBeNull();
  });

  test("home: production state, last deploy and memory from the last reading", async () => {
    const w = world({
      rows: [
        ...rows(),
        dep({ id: "failed", status: "failed", createdAt: new Date(T0) }),
      ],
    });
    w.domains.rows.push(
      domainRow("kd-hello.fockus.dev", { project: "kd_hello" }),
      domainRow("hola.example.com", {
        project: "kd_hello",
        dnsOkAt: new Date(T0),
      }),
    );
    const h = await readHome(w.deps);
    expect(h.projects).toEqual([
      {
        name: "kd_hello",
        repo: "fockus26/kd-hello",
        // A newer failed build does not take the live one down.
        production: "live",
        live: expect.objectContaining({ shortSha: expect.any(String) }),
        domain: "hola.example.com",
        lastDeploy: expect.objectContaining({ at: new Date(T0) }),
        memory: { usedBytes: 100, limitBytes: 400 },
      },
    ]);
    expect(h.lastDeployAt).toEqual(new Date(T0));
    expect(h.vps?.cpus).toBe(4);
    expect(h.alerts).toEqual([]);
  });

  test("deployments filter and durations; only kept production builds are rollbackable", async () => {
    const d = await readDeployments(world({ rows: rows() }).deps, "kd_hello", {
      environment: "production",
    });
    expect(d?.counts).toEqual({ production: 2, preview: 3 });
    expect(d?.deployments.map((x) => [x.id, x.rollbackable])).toEqual([
      ["live", false],
      ["old", true],
    ]);
    expect(d?.deployments[0]?.durationS).toBeGreaterThan(0);
  });

  test("previewsOf: a closed PR's history is not a preview", () => {
    expect(
      previewsOf(
        "kd_hello",
        rows().filter((r) => r.pr === 9),
      ).previews,
    ).toEqual([]);
  });
});

describe("panel data: domains, logs, databases, settings", () => {
  test("domains: default flagged, certificate tone, DNS records", async () => {
    const w = world();
    w.domains.rows.push(
      domainRow("kd-hello.fockus.dev", {
        project: "kd_hello",
        status: "ready",
        certNotAfter: new Date(T0 + 60 * 86_400_000),
        dnsCheckedAt: new Date(T0 - 60_000),
      }),
      domainRow("tienda.com", {
        project: "kd_hello",
        status: "ready",
        certNotAfter: new Date(T0 + 5 * 86_400_000),
        dnsCheckedAt: new Date(T0),
      }),
      domainRow("www.tienda.com", {
        project: "kd_hello",
        status: "error",
        redirect: "to_apex",
        lastError: "DNS apunta a otro sitio",
      }),
    );
    const d = await readDomains(w.deps, "kd_hello");
    expect(d?.lastCheckedAt).toEqual(new Date(T0));
    expect(d?.domains.map((x) => [x.host, x.isDefault, x.certTone])).toEqual([
      ["kd-hello.fockus.dev", true, "ok"],
      ["tienda.com", false, "soon"],
      ["www.tienda.com", false, "error"],
    ]);
    expect(d?.domains[2]).toMatchObject({
      redirectsTo: "tienda.com",
      dns: { zone: "tienda.com" },
    });
  });

  test("logs, databases: kit-agent down or refusing is a typed unavailable", async () => {
    const w = world({ agent: down });
    expect(await readLogsTail(w.deps, "kd_hello")).toEqual({
      unavailable: "agent",
    });
    expect(await readDatabases(w.deps, "kd_hello")).toEqual({
      unavailable: "agent",
    });
    const refusing: AgentClient = {
      async call() {
        return {
          id: "x",
          ok: false,
          error: { code: "command_failed", message: "kit-db: not found" },
        };
      },
    };
    expect(
      await readDatabases(world({ agent: refusing }).deps, "kd_hello"),
    ).toEqual({ unavailable: "agent", code: "command_failed" });
    expect(await readDatabases(w.deps, "nope")).toBeNull();
  });

  test("log filters: production and each PR, the last 14 days", async () => {
    const f = await readLogFilters(
      world({ rows: [dep({ environment: "preview", pr: 3 })] }).deps,
      "kd_hello",
    );
    expect(f?.sources).toEqual([
      { env: "production", label: "Producción" },
      { env: "pr-3", label: "Preview #3" },
    ]);
    expect(f?.days).toHaveLength(14);
    expect(f?.days[0]).toBe("2026-11-17");
  });

  test("settings: passkeys, TOTP, tokens; never a hash", async () => {
    const s = await readSettings(world().deps, USER.userId);
    expect(s).toMatchObject({
      totp: true,
      passkeys: [{ name: "MacBook" }],
      tokens: [],
      audit: [],
      auditPage: 1,
      auditPages: 1,
    });
  });

  test("Auditoría pages of 20: page math (empty, 20, 21, last, out of range, garbage)", () => {
    expect(AUDIT_PAGE).toBe(20);
    expect(auditPaging(0, undefined)).toEqual({ page: 1, pages: 1, offset: 0 });
    expect(auditPaging(20, "1")).toEqual({ page: 1, pages: 1, offset: 0 });
    expect(auditPaging(20, "2")).toEqual({ page: 1, pages: 1, offset: 0 });
    expect(auditPaging(21, "2")).toEqual({ page: 2, pages: 2, offset: 20 });
    expect(auditPaging(45, "3")).toEqual({ page: 3, pages: 3, offset: 40 });
    expect(auditPaging(45, "99")).toEqual({ page: 3, pages: 3, offset: 40 });
    for (const bad of ["0", "-2", "abc", "2.5", "", "1e3", undefined, 4, ["2"]])
      expect(auditPaging(45, bad).page).toBe(1);
  });

  test("Auditoría: each page is 20 rows, newest first; the last has the rest", async () => {
    const audit = auditRows(45);
    const w = world({ audit });
    const first = await readSettings(w.deps, USER.userId);
    expect(first.audit.map((r) => r.id)).toEqual(
      audit.slice(0, 20).map((r) => r.id),
    );
    expect([first.auditPage, first.auditPages]).toEqual([1, 3]);
    const last = await readSettings(w.deps, USER.userId, "3");
    expect(last.audit).toHaveLength(5);
    expect(last.audit[0]?.id).toBe("a40");
    const past = await readSettings(w.deps, USER.userId, "50");
    expect(past.auditPage).toBe(3);
    // An old `?antes=` link has no `pagina`: page 1.
    expect((await readSettings(w.deps, USER.userId, undefined)).auditPage).toBe(
      1,
    );
  });
});

describe("panel data: alerts and cron (phase 06)", () => {
  const obs = {
    key: "site_down:kd_hello",
    kind: "site_down" as const,
    project: "kd_hello",
    failing: true,
    title: "kd_hello no responde",
    detail: "/api/health respondió 502.",
  };

  test("Inicio lists the open alerts; Ajustes the recent ones and the last email", async () => {
    const w = world();
    await w.alerts.store.open(obs, new Date(T0));
    await w.alerts.store.open(
      {
        ...obs,
        key: "disk",
        kind: "disk",
        project: null,
        title: "Disco del VPS al 85 %",
      },
      new Date(T0),
    );
    const disk = (await w.alerts.store.openAlerts()).find(
      (a) => a.key === "disk",
    );
    await w.alerts.store.resolve(disk?.id ?? "", new Date(T0 + 60_000));
    await w.alerts.store.markNotified(
      await w.alerts.store.pending(10),
      new Date(T0 + 120_000),
    );

    const h = await readHome(w.deps);
    expect(h.alerts).toEqual([
      {
        id: expect.any(String),
        kind: "site_down",
        kindLabel: "Sitio caído",
        project: "kd_hello",
        title: "kd_hello no responde",
        detail: "/api/health respondió 502.",
        openedAt: new Date(T0),
      },
    ]);
    const s = await readSettings(w.deps, USER.userId);
    expect(s.alerts.map((a) => [a.title, a.resolvedAt !== null])).toEqual([
      ["Disco del VPS al 85 %", true],
      ["kd_hello no responde", false],
    ]);
    expect(s.lastEmailAt).toEqual(new Date(T0 + 120_000));
  });

  test("Cron: jobs with their next UTC run (none when paused); unknown project is null", async () => {
    const w = world();
    w.cronJobs.push(
      {
        id: "j1",
        project: "kd_hello",
        path: "/api/cron/diario",
        schedule: "0 3 * * *",
        enabled: true,
        createdAt: new Date(T0),
      },
      {
        id: "j2",
        project: "kd_hello",
        path: "/api/cron/x",
        schedule: "* * * * *",
        enabled: false,
        createdAt: new Date(T0),
      },
    );
    const c = await readCron(w.deps, "kd_hello");
    expect(c?.jobs.map((j) => [j.id, j.next !== null])).toEqual([
      ["j1", true],
      ["j2", false],
    ]);
    expect(c?.jobs[0]?.next?.getUTCHours()).toBe(3);
    expect(await readCron(w.deps, "nope")).toBeNull();
  });
});
