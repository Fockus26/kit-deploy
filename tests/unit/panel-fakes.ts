/** In-memory stores and a real kit-agent for the panel's actions and readers (phase 05 W6). */
import { randomBytes } from "node:crypto";
import { dispatch } from "../../agent/dispatch";
import { Agent, MASTER_KEY } from "../../agent/ops";
import type { Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import type { DashboardUser } from "../../lib/auth/session";
import {
  AdminError,
  type AdminStore,
  type NewProject,
} from "../../lib/db/admin";
import type { AuditEntry } from "../../lib/db/audit";
import type { EnvStore, StoredVar } from "../../lib/db/env-store";
import type { TokenRow, TokenStore } from "../../lib/db/tokens";
import type { ActionDeps } from "../../lib/panel/actions/deps";
import { fakeDeps } from "./agent-fakes";
import {
  fakeAgent,
  memoryRepo,
  type Row,
  deps as switchDeps,
} from "./deploy-fakes";
import { domainWorld } from "./domain-fakes";

export const USER: DashboardUser = {
  userId: "u_cesar01",
  email: "qa@example.test",
};

/** kit-agent itself (fake Docker, a real master key): what the panel sends is what it gets. */
export function realAgent() {
  const f = fakeDeps();
  f.files.set(MASTER_KEY, randomBytes(32).toString("base64"));
  const agent = new Agent(f.deps);
  const sent: { op: string; params: unknown }[] = [];
  const client: AgentClient = {
    async call(op, params) {
      sent.push({ op, params });
      return (await dispatch(
        agent,
        f.deps,
        JSON.stringify({ id: "t", op, params }),
      )) as Response;
    },
  };
  return { client, sent, logs: f.logs };
}

export function memoryEnv(projects = ["kd_hello"]) {
  const rows = new Map<string, StoredVar & { project: string; env: string }>();
  const audit: {
    actor: string;
    action: string;
    project: string;
    environment: string;
    name: string;
  }[] = [];
  const key = (p: string, e: string, n: string) => `${p}/${e}/${n}`;
  const known = (p: string) => {
    if (!projects.includes(p)) throw new AdminError(`no project ${p}`);
  };
  const store: EnvStore = {
    async list(project, environment) {
      known(project);
      return [...rows.values()]
        .filter((r) => r.project === project && r.env === environment)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async set(project, environment, v, actor) {
      known(project);
      const k = key(project, environment, v.name);
      const created = !rows.has(k);
      rows.set(k, {
        ...v,
        project,
        env: environment,
        updatedAt: new Date("2026-11-17T20:00:00Z"),
        updatedBy: actor,
      });
      audit.push({
        actor,
        action: "env.set",
        project,
        environment,
        name: v.name,
      });
      return { created };
    },
    async remove(project, environment, name, actor) {
      known(project);
      const gone = rows.delete(key(project, environment, name));
      if (gone)
        audit.push({ actor, action: "env.remove", project, environment, name });
      return gone;
    },
  };
  return { store, rows, audit };
}

export function memoryAdmin(
  projects: { name: string; repo: string; branch?: string }[] = [
    { name: "kd_hello", repo: "fockus26/kd-hello" },
  ],
  /** Where the audit rows written with each change go (the same transaction in Postgres). */
  audit: AuditEntry[] = [],
) {
  const added: NewProject[] = [];
  const domains: { project: string; host: string; redirect: string }[] = [];
  const tokens: { project: string; hash: string; label: string; id: string }[] =
    [];
  const has = (n: string) => projects.find((p) => p.name === n);
  const admin: AdminStore = {
    async addProject(p, entry) {
      if (has(p.name) || projects.some((x) => x.repo === p.repo))
        throw new AdminError(
          `a project named ${p.name}, its repo or one of its domains already exists`,
        );
      projects.push({ name: p.name, repo: p.repo, branch: p.productionBranch });
      added.push(p);
      if (entry) audit.push(entry);
      return { id: `p_${p.name}` };
    },
    async addDomain(project, host, redirect = "none", entry) {
      if (!has(project)) throw new AdminError(`no project ${project}`);
      if (domains.some((d) => d.host === host))
        throw new AdminError(`${host} already belongs to a project`);
      domains.push({ project, host, redirect });
      if (entry) audit.push(entry);
    },
    async projectRepo(project) {
      return has(project)?.repo ?? null;
    },
    async productionBranch(project) {
      const p = has(project);
      return p ? (p.branch ?? "main") : null;
    },
    async addToken(project, hash, label, entry) {
      if (!has(project)) throw new AdminError(`no project ${project}`);
      const id = `00000000-0000-4000-8000-${String(tokens.length + 1).padStart(12, "0")}`;
      tokens.push({ project, hash, label, id });
      if (entry) audit.push(entry);
      return { id };
    },
  };
  return { admin, added, domains, tokens, audit };
}

export function memoryTokens(rows: TokenRow[] = [], audit: AuditEntry[] = []) {
  const store: TokenStore = {
    async list() {
      return [...rows];
    },
    async find(id) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async revoke(id, now = new Date(), entry) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.revokedAt) return false;
      r.revokedAt = now;
      if (entry) audit.push(entry);
      return true;
    },
  };
  return { store, rows, audit };
}

/** Everything an action needs, in memory; `user: null` is a request without a session. */
export function actionWorld(
  opts: {
    user?: DashboardUser | null;
    rows?: Row[];
    agent?: AgentClient;
    open?: { id: string; sha: string; generation: number } | null;
    github?: ActionDeps["github"];
  } = {},
) {
  const env = memoryEnv();
  const audit: AuditEntry[] = [];
  const admin = memoryAdmin(undefined, audit);
  const tokens = memoryTokens([], audit);
  const fa = fakeAgent();
  const agent = opts.agent ?? fa.agent;
  const repo = memoryRepo(opts.rows ?? []);
  const sw = switchDeps(agent, repo);
  const domains = domainWorld([], { projects: ["kd_hello"], live: [] });
  const removeHost = domains.deps.store.remove;
  domains.deps.store.remove = async (project, host, entry) => {
    const gone = await removeHost(project, host);
    if (gone && entry) audit.push(entry);
    return gone;
  };
  const later: (() => Promise<void>)[] = [];
  const revalidated: string[] = [];
  const deps: ActionDeps = {
    user: async () => (opts.user === undefined ? USER : opts.user),
    agent,
    env: env.store,
    admin: admin.admin,
    tokens: tokens.store,
    switch: sw.d,
    domains: domains.deps,
    openDeployment: async () => opts.open ?? null,
    github: opts.github ?? (() => null),
    later: (task) => void later.push(task),
    revalidate: (path) => void revalidated.push(path),
    audit: { record: async (entry) => void audit.push(entry) },
  };
  return {
    deps,
    env,
    admin,
    tokens,
    fa,
    repo,
    domains,
    later,
    revalidated,
    audit,
  };
}

/** A FormData as the browser sends it. */
export function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const one of Array.isArray(v) ? v : [v]) f.append(k, one);
  return f;
}
