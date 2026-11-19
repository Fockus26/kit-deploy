/**
 * Variables, Dominios, Logs, Bases de datos and Ajustes (HANDOFF §3), pure over PanelDeps. A
 * secret's value never leaves kit-agent: its row type has no value field at all, and only plain
 * rows are ever sent to `env.reveal`.
 */
import type { DbStatus } from "@/agent/databases";
import type { LogEntry } from "@/agent/logs";
import type { AlertRow } from "@/lib/alerts/engine";
import { KIND_LABEL } from "@/lib/alerts/rules";
import {
  ENVIRONMENTS,
  type Environment,
  isPublicName,
  MANAGED_NAMES,
} from "@/lib/core/env";
import { defaultHost } from "@/lib/core/target";
import type { CronJob, CronRun } from "@/lib/cron/run";
import { nextRun, parseSchedule } from "@/lib/cron/schedule";
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

export type RecentAlert = {
  id: string;
  kindLabel: string;
  project: string | null;
  title: string;
  openedAt: Date;
  resolvedAt: Date | null;
};

export type SettingsData = {
  /** Ajustes › Alertas: the last ones, newest first, and when the last email went out. */
  alerts: RecentAlert[];
  lastEmailAt: Date | null;
  passkeys: PasskeyRow[];
  totp: boolean;
  tokens: TokenRow[];
  audit: AuditRow[];
  /** Auditoría's page (1-based, already clamped) and how many there are (at least 1). */
  auditPage: number;
  auditPages: number;
};

/**
 * Auditoría's paging (D063): `?pagina=N`, 1-based. Anything that is not a whole number ≥ 1 is
 * page 1, past the last is the last, and no rows at all is still "page 1 of 1".
 */
export function auditPaging(
  total: number,
  requested: unknown,
): { page: number; pages: number; offset: number } {
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE));
  const n =
    typeof requested === "string" && /^d{1,9}$/.test(requested)
      ? Number(requested)
      : 1;
  const page = Math.min(Math.max(n, 1), pages);
  return { page, pages, offset: (page - 1) * AUDIT_PAGE };
}

export async function readSettings(
  deps: PanelDeps,
  userId: string,
  auditPage?: string,
): Promise<SettingsData> {
  const [recent, passkeys, totp, tokens, total] = await Promise.all([
    deps.alerts.recent(RECENT_ALERTS),
    deps.store.passkeys(userId),
    deps.store.twoFactorEnabled(userId),
    deps.tokens.list(),
    deps.store.auditCount(),
  ]);
  const paging = auditPaging(total, auditPage);
  const audit = await deps.store.audit({
    offset: paging.offset,
    limit: AUDIT_PAGE,
  });
  return {
    alerts: recent.map((a) => ({
      id: a.id,
      kindLabel: KIND_LABEL[a.kind],
      project: a.project,
      title: a.title,
      openedAt: a.openedAt,
      resolvedAt: a.resolvedAt,
    })),
    lastEmailAt: lastEmail(recent),
    passkeys,
    totp,
    tokens,
    audit,
    auditPage: paging.page,
    auditPages: paging.pages,
  };
}

/** Ajustes › Alertas shows this many. */
export const RECENT_ALERTS = 10;

function lastEmail(rows: AlertRow[]): Date | null {
  const times = rows
    .flatMap((a) => [a.notifiedAt, a.resolvedNotifiedAt])
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

// ── Cron (phase 06, D048, D052) ──

export type CronJobRow = CronJob & {
  /** The next UTC minute it runs; null when paused or the schedule never fires. */
  next: Date | null;
};

export type CronData = { jobs: CronJobRow[]; runs: CronRun[] };

/** The Cron tab shows this many runs (all jobs together, newest first). */
export const CRON_RUNS = 50;

export async function readCron(
  deps: PanelDeps,
  project: string,
): Promise<CronData | null> {
  const p = await deps.store.project(project);
  if (!p) return null;
  const [jobs, runs] = await Promise.all([
    deps.cron.jobs(project),
    deps.cron.runs(project, CRON_RUNS),
  ]);
  const now = new Date(deps.now());
  return {
    jobs: jobs.map((j) => {
      let next: Date | null = null;
      if (j.enabled) {
        try {
          next = nextRun(parseSchedule(j.schedule), now);
        } catch {
          next = null;
        }
      }
      return { ...j, next };
    }),
    runs,
  };
}
