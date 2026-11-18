/**
 * `kit-deploy domain check` (brief F6), every minute from kit-deploy-domain-check.timer:
 *
 *   pending_dns ──DNS resolves to the VPS──▶ issuing ──Caddy holds its certificate──▶ ready
 *                                               └── no certificate after ISSUE_TIMEOUT_MS ──▶ error
 *   ready ──hourly: expiry within EXPIRY_WARN_MS, or DNS moved away──▶ error
 *
 * A host goes into its Caddy site the first time its DNS points here (`dnsOkAt`, D028), and the
 * project's site file is rewritten then; it is never taken out by a check (production keeps
 * answering if DNS flaps — `domain rm` takes it out). The certificate is read by kit-agent
 * (`cert.status`, D029). One host's failure is recorded on its row and never stops the others.
 */
import type { AgentClient } from "../../cli/client";
import type { DomainStatus } from "../db/schema";
import { dnsProblem, type Resolved, redirectTarget } from "./dns";
import {
  type DomainPatch,
  type DomainRow,
  type DomainStore,
  shortError,
} from "./store";

/** Non-ready hosts are looked at on every run; ready ones this often. */
export const READY_RECHECK_MS = 60 * 60_000;
/** Caddy usually has a certificate within a minute of the host being in its config. */
export const ISSUE_TIMEOUT_MS = 30 * 60_000;
/** Caddy renews 30 days before expiry: a week left means renewal is failing. */
export const EXPIRY_WARN_MS = 7 * 24 * 60 * 60_000;

export type ResolveHost = (host: string) => Promise<Resolved>;

export type CheckDeps = {
  store: DomainStore;
  resolve: ResolveHost;
  agent: AgentClient;
  /** Projects with a live production deployment: only those have a site file to write. */
  liveProjects(): Promise<Set<string>>;
  /** Rewrites one project's site file from its rows (the switch's `regenerate`). */
  regenerate(project: string): Promise<{ ok: boolean; error?: string }>;
  now?: () => number;
};

export type CheckLine = {
  project: string;
  host: string;
  from: DomainStatus;
  to: DomainStatus;
  /** Why, when it is not ready. */
  note: string | null;
};

export type CheckReport = {
  /** Every host looked at. */
  checked: number;
  /** The ones whose status or note changed. */
  changed: CheckLine[];
  /** kit-agent or the site rewrite failed (exit 1, so the journal shows it). */
  failed: number;
};

const minutes = (ms: number) => Math.round(ms / 60_000);
const day = (d: Date) => d.toISOString().slice(0, 10);

type Work = { row: DomainRow; patch: DomainPatch & { status: DomainStatus } };

/** `force`: every host of the selection now, ready ones included (`--project`). */
export async function checkDomains(
  deps: CheckDeps,
  opts: { project?: string; force?: boolean } = {},
): Promise<CheckReport> {
  const now = new Date((deps.now ?? Date.now)());
  const rows = await deps.store.list(opts.project);
  const due = rows.filter(
    (r) =>
      opts.force ||
      r.status !== "ready" ||
      r.dnsCheckedAt === null ||
      now.getTime() - r.dnsCheckedAt.getTime() >= READY_RECHECK_MS,
  );
  let failed = 0;
  const work: Work[] = [];
  const pointedNow = new Map<string, Work[]>();

  // 1 · DNS, host by host (each lookup has its own timeout in `resolve`).
  for (const row of due) {
    let problem: string | null;
    try {
      problem = dnsProblem(await deps.resolve(row.host));
    } catch (e) {
      problem = `DNS lookup failed: ${(e as Error).message}`;
    }
    const w: Work = {
      row,
      patch: { status: row.status, dnsCheckedAt: now },
    };
    work.push(w);
    if (row.dnsOkAt === null) {
      if (problem) {
        w.patch = { ...w.patch, status: "pending_dns", lastError: problem };
        continue;
      }
      w.patch = {
        ...w.patch,
        status: "issuing",
        dnsOkAt: now,
        lastError: null,
      };
      pointedNow.set(row.project, [...(pointedNow.get(row.project) ?? []), w]);
    } else if (problem) {
      w.patch.lastError = `DNS no longer points to the VPS: ${problem}`;
    }
  }

  // 2 · Newly pointed hosts go into their site: the row first (the site is rendered from it).
  const live = await deps.liveProjects();
  for (const [project, ws] of pointedNow) {
    for (const w of ws) await deps.store.update(w.row.id, w.patch);
    if (!live.has(project)) continue;
    const res = await deps
      .regenerate(project)
      .catch((e: Error) => ({ ok: false, error: e.message }));
    if (res.ok) continue;
    failed++;
    // Back to pending: the next run tries the rewrite again.
    for (const w of ws) {
      w.patch = {
        ...w.patch,
        status: "pending_dns",
        dnsOkAt: null,
        lastError: `site file not rewritten: ${res.error ?? "unknown error"}`,
      };
    }
  }

  // 3 · Certificates of the hosts in a site.
  const pointed = new Set(
    rows
      .filter((r) => r.dnsOkAt !== null)
      .map((r) => r.host)
      .concat(work.filter((w) => w.patch.dnsOkAt).map((w) => w.row.host)),
  );
  for (const w of work) {
    const dnsOkAt =
      w.patch.dnsOkAt === undefined ? w.row.dnsOkAt : w.patch.dnsOkAt;
    if (dnsOkAt === null) continue;
    const dnsNote = w.patch.lastError ?? null;
    if (!live.has(w.row.project)) {
      w.patch = {
        ...w.patch,
        status: "issuing",
        lastError:
          "not deployed yet: Caddy gets the certificate once production is live",
      };
      continue;
    }
    const to = safeTarget(w.row);
    if (to && !pointed.has(to)) {
      w.patch.lastError = `serves the site until ${to} points to the VPS, then redirects to it`;
    }
    const res = await deps.agent
      .call("cert.status", { host: w.row.host })
      .catch((e: Error) => ({
        ok: false as const,
        id: null,
        error: { code: "internal" as const, message: e.message },
      }));
    if (!res.ok) {
      failed++;
      w.patch.lastError = `kit-agent: ${res.error.code}: ${res.error.message}`;
      continue;
    }
    const cert = res.result as { notAfter: string } | null;
    if (cert === null) {
      const waited = now.getTime() - dnsOkAt.getTime();
      w.patch = {
        ...w.patch,
        certNotAfter: null,
        ...(waited > ISSUE_TIMEOUT_MS
          ? {
              status: "error",
              lastError: `no certificate ${minutes(waited)} min after DNS pointed to the VPS: journalctl -u caddy`,
            }
          : {
              status: "issuing",
              lastError: dnsNote ?? w.patch.lastError ?? null,
            }),
      };
      continue;
    }
    const notAfter = new Date(cert.notAfter);
    const left = notAfter.getTime() - now.getTime();
    w.patch.certNotAfter = notAfter;
    if (left <= 0) {
      w.patch = {
        ...w.patch,
        status: "error",
        lastError: `certificate expired on ${day(notAfter)}`,
      };
    } else if (left < EXPIRY_WARN_MS) {
      w.patch = {
        ...w.patch,
        status: "error",
        lastError: `certificate expires on ${day(notAfter)} and Caddy has not renewed it: journalctl -u caddy`,
      };
    } else if (dnsNote) {
      w.patch = { ...w.patch, status: "error", lastError: dnsNote };
    } else {
      w.patch = {
        ...w.patch,
        status: "ready",
        lastError: w.patch.lastError ?? null,
      };
    }
  }

  // 4 · Write back; report what changed.
  const changed: CheckLine[] = [];
  for (const w of work) {
    const note =
      w.patch.lastError === undefined ? w.row.lastError : w.patch.lastError;
    if (w.patch.lastError) w.patch.lastError = shortError(w.patch.lastError);
    await deps.store.update(w.row.id, w.patch);
    if (w.patch.status !== w.row.status || (note ?? null) !== w.row.lastError) {
      changed.push({
        project: w.row.project,
        host: w.row.host,
        from: w.row.status,
        to: w.patch.status,
        note: note ? shortError(note) : null,
      });
    }
  }
  return { checked: work.length, changed, failed };
}

function safeTarget(row: DomainRow): string | null {
  try {
    return redirectTarget(row.host, row.redirect);
  } catch {
    return null;
  }
}
