import type { OpName, Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import type {
  ClaimedDeployment,
  KeptDeployment,
  RunningPreview,
  SealedVar,
  SwitchRepo,
} from "../../lib/deploy/repo";
import type { SwitchDeps } from "../../lib/deploy/switch";

/** In-memory kit-agent and kit_deploy for the switch and the CLI's deploy commands. */
export const sha = (c: string) => c.repeat(40);
export const name = (c: string) => `kd_hello-prod-${c.repeat(12)}`;

export type Row = {
  id: string;
  sha: string;
  /** A preview's PR; absent = production. */
  pr?: number;
  status: KeptDeployment["status"];
  container: string | null;
  port: number | null;
  createdAt: Date;
  error?: string;
};

/** Same scope: production, or the same PR. */
const same = (a: Row, b: Row) => (a.pr ?? null) === (b.pr ?? null);

/** An in-memory kit_deploy for one project, kd_hello. */
export function memoryRepo(
  rows: Row[],
  hosts = ["hello.fockus.dev"],
  vars: Partial<Record<"production" | "preview", SealedVar[]>> = {},
) {
  const repo: SwitchRepo = {
    async withProjectLock(_id, fn) {
      return fn();
    },
    async claimNext() {
      const [next] = rows
        .filter((r) => r.status === "queued")
        .sort((a, b) => +b.createdAt - +a.createdAt);
      if (!next) return null;
      for (const o of rows)
        if (o !== next && o.status === "queued" && same(o, next))
          o.status = "superseded";
      next.status = "starting";
      const c: ClaimedDeployment = {
        id: next.id,
        sha: next.sha,
        image: `ghcr.io/fockus26/kd-hello:${next.sha}`,
        pr: next.pr ?? null,
        project: {
          id: "p1",
          name: "kd_hello",
          repo: "Fockus26/kd-hello",
          memoryMb: 512,
        },
        hosts,
      };
      return c;
    },
    async markLive(id, container, port) {
      const me = rows.find((r) => r.id === id);
      const prev =
        rows.find(
          (r) =>
            (r.status === "live" || r.status === "asleep") &&
            r.id !== id &&
            me !== undefined &&
            same(r, me),
        ) ?? null;
      if (prev) prev.status = "superseded";
      if (me) Object.assign(me, { status: "live", container, port });
      return prev ? { id: prev.id, container: prev.container } : null;
    },
    async markFailed(id, error) {
      const me = rows.find((r) => r.id === id);
      if (me) Object.assign(me, { status: "failed", error });
    },
    async listKept() {
      return rows
        .filter(
          (r): r is Row & { container: string } =>
            r.container !== null && r.pr === undefined,
        )
        .sort((a, b) => +b.createdAt - +a.createdAt)
        .map(({ id, sha, status, container, port, createdAt }) => ({
          id,
          sha,
          status,
          container,
          port,
          createdAt,
        }));
    },
    async clearContainer(id) {
      const me = rows.find((r) => r.id === id);
      if (me) Object.assign(me, { container: null, port: null });
    },
    async projectByName(n) {
      return n === "kd_hello"
        ? { id: "p1", name: n, repo: "Fockus26/kd-hello", memoryMb: 512, hosts }
        : null;
    },
    async liveSites() {
      return rows
        .filter(
          (r) =>
            r.status === "live" && r.container && r.port && r.pr === undefined,
        )
        .map((r) => ({
          deploymentId: r.id,
          project: "kd_hello",
          hosts,
          container: r.container as string,
          port: r.port as number,
        }));
    },
    async runningPreviews() {
      const out = new Map<number, RunningPreview>();
      for (const r of rows) {
        if (r.pr === undefined || !r.container) continue;
        if (r.status !== "live" && r.status !== "asleep") continue;
        if (out.get(r.pr)?.status === "live") continue;
        const pushes = rows
          .filter((o) => o.pr === r.pr)
          .map((o) => +o.createdAt);
        out.set(r.pr, {
          id: r.id,
          pr: r.pr,
          status: r.status,
          container: r.container,
          lastPushAt: new Date(Math.max(...pushes)),
        });
      }
      return [...out.values()];
    },
    async markAsleep(id) {
      const me = rows.find((r) => r.id === id);
      if (!me || me.pr === undefined || me.status !== "live") return false;
      me.status = "asleep";
      return true;
    },
    async closePreview(_projectId, pr) {
      const mine = rows.filter((r) => r.pr === pr);
      for (const r of mine)
        if (["queued", "starting", "live", "asleep"].includes(r.status))
          r.status = "superseded";
      return mine.flatMap((r) =>
        r.container ? [{ id: r.id, container: r.container }] : [],
      );
    },
    async envVars(_projectId, environment) {
      return vars[environment] ?? [];
    },
  };
  return repo;
}

export type Answer = (params: Record<string, unknown>) => Response;
export const ok = (result: unknown): Response => ({
  id: "x",
  ok: true,
  result,
});
export const err = (message: string): Response => ({
  id: "x",
  ok: false,
  error: { code: "command_failed", message },
});

export function fakeAgent(overrides: Partial<Record<OpName, Answer>> = {}) {
  const calls: Array<{ op: OpName; params: Record<string, unknown> }> = [];
  const defaults: Partial<Record<OpName, Answer>> = {
    "image.pull": (p) => ok({ image: p.image }),
    "ports.allocate": () => ok({ name: "ignored", port: 20500 }),
    "container.run": () => ok({ name: "x", id: "abc" }),
    "container.start": (p) => ok({ name: p.name }),
    "container.stop": (p) => ok({ name: p.name }),
    "container.remove": (p) => ok({ name: p.name }),
    "health.check": () => ok({ ok: true, status: 200 }),
    "site.write": () =>
      ok({ path: "/etc/caddy/sites/kd_hello.caddy", changed: true }),
    "container.list": () => ok([]),
    "preview.write": (p) =>
      ok({
        path: `/etc/caddy/previews/kd_hello-pr-${p.pr}.caddy`,
        state: p.state,
        changed: true,
      }),
    "preview.remove": (p) =>
      ok({
        path: `/etc/caddy/previews/kd_hello-pr-${p.pr}.caddy`,
        removed: true,
      }),
  };
  const agent: AgentClient = {
    async call(op, params) {
      calls.push({ op, params: params as Record<string, unknown> });
      const a = overrides[op] ?? defaults[op];
      if (!a) throw new Error(`unexpected op ${op}`);
      return a(params as Record<string, unknown>);
    },
  };
  return { agent, calls, ops: () => calls.map((c) => c.op) };
}

export function deps(agent: AgentClient, repo: SwitchRepo) {
  const sleeps: number[] = [];
  const logs: Record<string, unknown>[] = [];
  const d: SwitchDeps = {
    agent,
    repo,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    log: (e) => logs.push(e),
    healthTimeoutMs: 3_000,
    healthIntervalMs: 1_000,
    drainMs: 10_000,
  };
  return { d, sleeps, logs };
}

export const at = (n: number) => new Date(2026, 10, 11, 12, n);
