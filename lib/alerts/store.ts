/**
 * `alerts` and `alert_checks` in Postgres (D012), plus what the checks read: live sites, domains'
 * certificates, the last production deployment per project and the VPS' last reading. Server
 * only (the CLI's alerts check and the panel's Inicio).
 */
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  alertChecks,
  alerts,
  auditLog,
  deployments,
  domains,
  projects,
} from "../db/schema";
import type { Db } from "../db/store";
import { drizzleMetricsReader } from "../metrics/read";
import type { CheckRepo } from "./checks";
import type { AlertRow, AlertStore, Streak } from "./engine";

const ROW = {
  id: alerts.id,
  key: alerts.key,
  kind: alerts.kind,
  project: alerts.project,
  title: alerts.title,
  detail: alerts.detail,
  openedAt: alerts.openedAt,
  lastSeenAt: alerts.lastSeenAt,
  resolvedAt: alerts.resolvedAt,
  notifiedAt: alerts.notifiedAt,
  resolvedNotifiedAt: alerts.resolvedNotifiedAt,
};

/** Title and detail as stored: bounded, single line. */
const clip = (s: string, max: number) =>
  s.replace(/\p{Cc}/gu, " ").slice(0, max);

export function drizzleAlertStore(db: Db): AlertStore {
  return {
    async streaks() {
      const rows = await db.select().from(alertChecks);
      return new Map(
        rows.map((r) => [r.key, { failing: r.failing, streak: r.streak }]),
      );
    },
    async saveStreaks(rows: Map<string, Streak>, now) {
      if (rows.size === 0) return;
      await db
        .insert(alertChecks)
        .values(
          [...rows].map(([key, s]) => ({
            key,
            failing: s.failing,
            streak: s.streak,
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: alertChecks.key,
          set: {
            failing: sql`excluded.failing`,
            streak: sql`excluded.streak`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    },
    async pruneStreaks(before) {
      await db.delete(alertChecks).where(lt(alertChecks.updatedAt, before));
    },
    async openAlerts() {
      return db
        .select(ROW)
        .from(alerts)
        .where(isNull(alerts.resolvedAt))
        .orderBy(asc(alerts.openedAt));
    },
    async open(o, now) {
      await db
        .insert(alerts)
        .values({
          key: o.key,
          kind: o.kind,
          project: o.project,
          title: clip(o.title, 200),
          detail: clip(o.detail, 500),
          openedAt: now,
          lastSeenAt: now,
        })
        // A concurrent run opened it first: that one owns the email.
        .onConflictDoNothing();
    },
    async touch(id, o, now) {
      await db
        .update(alerts)
        .set({
          lastSeenAt: now,
          title: clip(o.title, 200),
          detail: clip(o.detail, 500),
        })
        .where(eq(alerts.id, id));
    },
    async resolve(id, now, detail) {
      await db
        .update(alerts)
        .set({
          resolvedAt: now,
          ...(detail ? { detail: clip(detail, 500) } : {}),
        })
        .where(and(eq(alerts.id, id), isNull(alerts.resolvedAt)));
    },
    async pending(limit) {
      return db
        .select(ROW)
        .from(alerts)
        .where(
          or(
            isNull(alerts.notifiedAt),
            and(
              isNotNull(alerts.resolvedAt),
              isNull(alerts.resolvedNotifiedAt),
            ),
          ),
        )
        .orderBy(asc(alerts.openedAt))
        .limit(limit);
    },
    async markNotified(rows: AlertRow[], now) {
      if (rows.length === 0) return;
      const ids = rows.map((r) => r.id);
      // An alert opened and resolved before any email: one "resuelta" pays both.
      await db
        .update(alerts)
        .set({
          notifiedAt: sql`coalesce(${alerts.notifiedAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(inArray(alerts.id, ids));
      const resolvedIds = rows.filter((r) => r.resolvedAt).map((r) => r.id);
      if (resolvedIds.length)
        await db
          .update(alerts)
          .set({ resolvedNotifiedAt: now })
          .where(inArray(alerts.id, resolvedIds));
    },
  };
}

export type AlertsReader = {
  /** Inicio's "Alertas abiertas", oldest first. */
  open(): Promise<AlertRow[]>;
  /** `kit-deploy alerts ls --all`: the newest first. */
  recent(limit: number): Promise<AlertRow[]>;
};

export function drizzleAlertsReader(db: Db): AlertsReader {
  return {
    open: () =>
      db
        .select(ROW)
        .from(alerts)
        .where(isNull(alerts.resolvedAt))
        .orderBy(asc(alerts.openedAt)),
    recent: (limit) =>
      db.select(ROW).from(alerts).orderBy(desc(alerts.openedAt)).limit(limit),
  };
}

const STOP_ACTIONS = [
  "project.stop",
  "project.restart",
  "project.redeploy",
  "project.rollback",
] as const;

export function drizzleCheckRepo(db: Db): CheckRepo {
  const metrics = drizzleMetricsReader(db);
  return {
    async liveSites() {
      const rows = await db
        .select({
          project: projects.name,
          container: deployments.container,
          port: deployments.port,
        })
        .from(deployments)
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .where(
          and(
            eq(deployments.environment, "production"),
            eq(deployments.status, "live"),
          ),
        )
        .orderBy(asc(projects.name));
      const names = rows.map((r) => r.project);
      // The last of stop/restart/redeploy/rollback per project: "stop" means Parar on purpose.
      const last = names.length
        ? await db
            .selectDistinctOn([auditLog.project], {
              project: auditLog.project,
              action: auditLog.action,
            })
            .from(auditLog)
            .where(
              and(
                inArray(auditLog.project, names),
                inArray(auditLog.action, [...STOP_ACTIONS]),
              ),
            )
            .orderBy(auditLog.project, desc(auditLog.at))
        : [];
      const stopped = new Set(
        last.filter((l) => l.action === "project.stop").map((l) => l.project),
      );
      return rows.flatMap((r) =>
        r.container && r.port !== null
          ? [
              {
                project: r.project,
                container: r.container,
                port: r.port,
                stoppedOnPurpose: stopped.has(r.project),
              },
            ]
          : [],
      );
    },
    async domainCerts() {
      return db
        .select({
          project: projects.name,
          host: domains.host,
          certNotAfter: domains.certNotAfter,
          status: domains.status,
        })
        .from(domains)
        .innerJoin(projects, eq(projects.id, domains.projectId));
    },
    async lastProductionDeploys() {
      return db
        .selectDistinctOn([deployments.projectId], {
          project: projects.name,
          status: deployments.status,
          sha: deployments.sha,
          error: deployments.error,
          createdAt: deployments.createdAt,
        })
        .from(deployments)
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .where(eq(deployments.environment, "production"))
        .orderBy(deployments.projectId, desc(deployments.createdAt));
    },
    vps: () => metrics.vps(),
  };
}
