import type { OpName, Response } from "../../agent/protocol";
import type { AgentClient } from "../../cli/client";
import { VPS_IPV4 } from "../../lib/core/constants";
import { AdminError } from "../../lib/db/admin";
import type { CheckDeps } from "../../lib/domains/check";
import type { Resolved } from "../../lib/domains/dns";
import type { DomainRow, DomainStore } from "../../lib/domains/store";

export const T0 = Date.parse("2026-11-17T10:00:00Z");
export const MIN = 60_000;

let seq = 0;
export function domainRow(
  host: string,
  over: Partial<DomainRow> = {},
): DomainRow {
  return {
    id: `d${++seq}`,
    project: "shop",
    host,
    redirect: "none",
    status: "pending_dns",
    dnsCheckedAt: null,
    dnsOkAt: null,
    certNotAfter: null,
    lastError: null,
    createdAt: new Date(T0 - 60 * MIN),
    ...over,
  };
}

export const pointed: Resolved = { a: [VPS_IPV4], aaaa: [] };

/** In-memory domains, resolver, kit-agent (`cert.status` only) and site rewrites. */
export function domainWorld(
  rows: DomainRow[],
  opts: {
    dns?: Record<string, Resolved | Error>;
    certs?: Record<string, string | Error>;
    live?: string[];
    regenerate?: (project: string) => { ok: boolean; error?: string };
    projects?: string[];
  } = {},
) {
  let now = T0;
  const regenerated: string[] = [];
  const certCalls: string[] = [];
  const projects = new Set(
    opts.projects ?? ["shop", ...rows.map((r) => r.project)],
  );
  const store: DomainStore = {
    async list(project) {
      if (project !== undefined && !projects.has(project))
        throw new AdminError(`no project ${project}`);
      return rows
        .filter((r) => project === undefined || r.project === project)
        .map((r) => ({ ...r }))
        .sort((a, b) =>
          `${a.project} ${a.host}` < `${b.project} ${b.host}` ? -1 : 1,
        );
    },
    async setRedirect(project, host, redirect) {
      const r = rows.find((x) => x.project === project && x.host === host);
      if (r) r.redirect = redirect;
      return r !== undefined;
    },
    async remove(project, host) {
      const i = rows.findIndex((x) => x.project === project && x.host === host);
      if (i >= 0) rows.splice(i, 1);
      return i >= 0;
    },
    async update(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    },
  };
  const agent: AgentClient = {
    async call(op: OpName, params): Promise<Response> {
      if (op !== "cert.status") throw new Error(`unexpected op ${op}`);
      const host = (params as { host: string }).host;
      certCalls.push(host);
      const c = opts.certs?.[host];
      if (c instanceof Error)
        return {
          id: "x",
          ok: false,
          error: { code: "command_failed", message: c.message },
        };
      return {
        id: "x",
        ok: true,
        result: c ? { notAfter: c, issuer: "Let's Encrypt" } : null,
      };
    },
  };
  const deps: CheckDeps = {
    store,
    agent,
    resolve: async (host) => {
      const r = opts.dns?.[host];
      if (r instanceof Error) throw r;
      return r ?? { a: [], aaaa: [] };
    },
    liveProjects: async () => new Set(opts.live ?? ["shop"]),
    regenerate: async (project) => {
      regenerated.push(project);
      return opts.regenerate?.(project) ?? { ok: true };
    },
    now: () => now,
  };
  return {
    deps,
    rows,
    regenerated,
    certCalls,
    advance(ms: number) {
      now += ms;
    },
  };
}
