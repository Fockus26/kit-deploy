/**
 * Variables, Dominios, Logs, Bases de datos and Ajustes (HANDOFF §3), pure over PanelDeps. A
 * secret's value never leaves kit-agent: its row type has no value field at all, and only plain
 * rows are ever sent to `env.reveal`.
 */
import type { DbStatus } from "@/agent/databases";
import type { LogEntry } from "@/agent/logs";
import {
  ENVIRONMENTS,
  type Environment,
  isPublicName,
  MANAGED_NAMES,
} from "@/lib/core/env";
import { defaultHost } from "@/lib/core/target";
import type { DomainRedirect, DomainStatus } from "@/lib/db/schema";
import type { TokenRow } from "@/lib/db/tokens";
import { type DnsInstructions, dnsInstructions } from "@/lib/domains/dns";
import { callAgent } from "@/lib/ops/agent";
import { revealPlain } from "@/lib/ops/env";
import { type PanelDeps, type Unavailable, viaAgent } from "./deps";
import { AUDIT_PAGE, type AuditRow, type PasskeyRow } from "./store";

// ── Variables ──

type VarBase = {
  name: string;
  updatedAt: Date;
  /** `web:<user id>` or `ssh:<user>`. */
  updatedBy: string;
  /** NEXT_PUBLIC_*: inlined at build, so a change needs a rebuild. */
  public: boolean;
};
/** No `value` field: a secret is never read back, only replaced. */
export type SecretVar = VarBase & { secret: true };
/** null when kit-agent could not open it (see `values`). */
export type PlainVar = VarBase & { secret: false; value: string | null };
export type EnvVar = SecretVar | PlainVar;

export type EnvListData = {
  environment: Environment;
  vars: EnvVar[];
  /** Per environment, for the EnvTabs counters. */
  counts: Record<Environment, number>;
  /** "Gestionadas por la plataforma": set by kit-deploy itself, never shown or editable. */
  managed: readonly string[];
  /** Whether the plain values could be opened (no plain variables = ok). */
  values: "ok" | Unavailable;
};

export async function readEnvList(
  deps: PanelDeps,
  project: string,
  environment: Environment,
): Promise<EnvListData | null> {
  if (!(await deps.store.project(project))) return null;
  const lists = await Promise.all(
    ENVIRONMENTS.map((e) => deps.env.list(project, e)),
  );
  const counts = Object.fromEntries(
    ENVIRONMENTS.map((e, i) => [e, lists[i]?.length ?? 0]),
  ) as Record<Environment, number>;
  const rows = lists[ENVIRONMENTS.indexOf(environment)] ?? [];
  const opened = await viaAgent(() =>
    revealPlain(deps.agent, project, environment, rows),
  );
  const values = opened instanceof Map ? opened : null;
  const vars = rows.map((r): EnvVar => {
    const base = {
      name: r.name,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
      public: isPublicName(r.name),
    };
    // Built field by field: nothing of a secret's row but its name and dates.
    return r.secret
      ? { ...base, secret: true }
      : { ...base, secret: false, value: values?.get(r.name) ?? null };
  });
  return {
    environment,
    vars,
    counts,
    managed: MANAGED_NAMES,
    values: values ? "ok" : (opened as Unavailable),
  };
}

// ── Dominios ──

/** Certificate text in `--warning` within this many days of expiry (HANDOFF §3). */
export const CERT_WARN_DAYS = 14;

export type DomainItem = {
  host: string;
  isDefault: boolean;
  status: DomainStatus;
  redirect: DomainRedirect;
  redirectsTo: string | null;
  certNotAfter: Date | null;
  /** `soon`: ≤ 14 days left; `error`: the host is in error. */
  certTone: "ok" | "soon" | "error" | "none";
  lastError: string | null;
  dnsCheckedAt: Date | null;
  dns: DnsInstructions;
};

export type DomainsData = {
  domains: DomainItem[];
  /** The newest check of any of them ("última comprobación"). */
  lastCheckedAt: Date | null;
};

export async function readDomains(
  deps: PanelDeps,
  project: string,
): Promise<DomainsData | null> {
  if (!(await deps.store.project(project))) return null;
  const now = deps.now();
  const own = defaultHost(project);
  const rows = await deps.domains.list(project);
  const domains = rows.map((d): DomainItem => {
    let dns: DnsInstructions;
    try {
      dns = dnsInstructions(d.host, d.redirect);
    } catch {
      dns = dnsInstructions(d.host);
    }
    const left = d.certNotAfter ? +d.certNotAfter - now : null;
    return {
      host: d.host,
      isDefault: d.host === own,
      status: d.status,
      redirect: d.redirect,
      redirectsTo: dns.redirectsTo,
      certNotAfter: d.certNotAfter,
      certTone:
        d.status === "error"
          ? "error"
          : left === null
            ? "none"
            : left <= CERT_WARN_DAYS * 86_400_000
              ? "soon"
              : "ok",
      lastError: d.lastError,
      dnsCheckedAt: d.dnsCheckedAt,
      dns,
    };
  });
  const lastCheckedAt =
    rows
      .map((d) => d.dnsCheckedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => +b - +a)[0] ?? null;
  return { domains, lastCheckedAt };
}

// ── Logs ──

export const LOG_DAYS = 14;

export type LogsFilters = {
  /** `production` and each PR that still has a deployment, for the select. */
  sources: { env: string; label: string }[];
  /** The last 14 UTC days, newest first. */
  days: string[];
};

export async function readLogFilters(
  deps: PanelDeps,
  project: string,
): Promise<LogsFilters | null> {
  const p = await deps.store.project(project);
  if (!p) return null;
  const previews = await deps.store.deployments(p.id, {
    environment: "preview",
  });
  const prs = [
    ...new Set(previews.flatMap((d) => (d.pr === null ? [] : [d.pr]))),
  ].sort((a, b) => b - a);
  const today = Date.UTC(
    new Date(deps.now()).getUTCFullYear(),
    new Date(deps.now()).getUTCMonth(),
    new Date(deps.now()).getUTCDate(),
  );
  return {
    sources: [
      { env: "production", label: "Producción" },
      ...prs.map((pr) => ({ env: `pr-${pr}`, label: `Preview #${pr}` })),
    ],
    days: Array.from({ length: LOG_DAYS }, (_, i) =>
      new Date(today - i * 86_400_000).toISOString().slice(0, 10),
    ),
  };
}

export type LogLevel = "error" | "warn" | "info";

export function readLogsTail(
  deps: PanelDeps,
  project: string,
  opts: { env?: string; level?: LogLevel; lines?: number } = {},
): Promise<{ entries: LogEntry[] } | Unavailable> {
  return viaAgent(
    async () =>
      (await callAgent(deps.agent, "logs.tail", {
        project,
        ...opts,
      })) as { entries: LogEntry[] },
  );
}

export function readLogsSearch(
  deps: PanelDeps,
  project: string,
  opts: {
    day: string;
    query?: string;
    env?: string;
    level?: LogLevel;
    limit?: number;
    before?: number;
  },
): Promise<
  { day: string; entries: LogEntry[]; next: number | null } | Unavailable
> {
  return viaAgent(
    async () =>
      (await callAgent(deps.agent, "logs.search", { project, ...opts })) as {
        day: string;
        entries: LogEntry[];
        next: number | null;
      },
  );
}

// ── Bases de datos ──

export async function readDatabases(
  deps: PanelDeps,
  project: string,
): Promise<DbStatus | Unavailable | null> {
  if (!(await deps.store.project(project))) return null;
  return viaAgent(
    async () =>
      (await callAgent(deps.agent, "db.status", { project })) as DbStatus,
  );
}

// ── Ajustes ──

export type SettingsData = {
  passkeys: PasskeyRow[];
  totp: boolean;
  tokens: TokenRow[];
  audit: AuditRow[];
  /** Pass as `before` for the next page; null on the last one. */
  auditNext: Date | null;
};

export async function readSettings(
  deps: PanelDeps,
  userId: string,
  auditBefore?: Date,
): Promise<SettingsData> {
  const [passkeys, totp, tokens, audit] = await Promise.all([
    deps.store.passkeys(userId),
    deps.store.twoFactorEnabled(userId),
    deps.tokens.list(),
    deps.store.audit(auditBefore ? { before: auditBefore } : {}),
  ]);
  return {
    passkeys,
    totp,
    tokens,
    audit,
    auditNext: audit.length === AUDIT_PAGE ? (audit.at(-1)?.at ?? null) : null,
  };
}
