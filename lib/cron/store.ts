/**
 * `cron_jobs` and `cron_runs` in Postgres (D012, D048), for `kit-deploy cron` and the panel's Cron
 * tab. Adding, removing and pausing a job writes its audit row in the same transaction (D045).
 */
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { AdminError } from "../db/admin";
import { type AuditEntry, writeAudit } from "../db/audit";
import {
  cronJobs,
  cronRuns,
  deployments,
  envVars,
  projects,
} from "../db/schema";
import type { Db } from "../db/store";
import type { CronJob, CronRun, CronStore } from "./run";

export interface CronAdmin extends CronStore {
  /** Throws AdminError for an unknown project or the same path and schedule twice. */
  add(
    project: string,
    path: string,
    schedule: string,
    audit: AuditEntry,
  ): Promise<CronJob>;
  /** False when the project has no such job. */
  remove(project: string, id: string, audit: AuditEntry): Promise<boolean>;
  setEnabled(
    project: string,
    id: string,
    enabled: boolean,
    audit: AuditEntry,
  ): Promise<boolean>;
}

const ERROR_MAX = 300;

const JOB = {
  id: cronJobs.id,
  project: projects.name,
  path: cronJobs.path,
  schedule: cronJobs.schedule,
  enabled: cronJobs.enabled,
  createdAt: cronJobs.createdAt,
};

export function drizzleCronStore(db: Db): CronAdmin {
  const projectId = async (name: string) => {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, name));
    if (!p) throw new AdminError(`no project ${name}`);
    return p.id;
  };

  return {
    async jobs(project) {
      const where =
        project === undefined
          ? undefined
          : eq(cronJobs.projectId, await projectId(project));
      return db
        .select(JOB)
        .from(cronJobs)
        .innerJoin(projects, eq(projects.id, cronJobs.projectId))
        .where(where)
        .orderBy(
          asc(projects.name),
          asc(cronJobs.path),
          asc(cronJobs.schedule),
        );
    },

    async runs(project, limit, jobId) {
      const pid = await projectId(project);
      const rows = await db
        .select({
          id: cronRuns.id,
          jobId: cronRuns.jobId,
          project: projects.name,
          path: cronJobs.path,
          scheduledFor: cronRuns.scheduledFor,
          startedAt: cronRuns.startedAt,
          finishedAt: cronRuns.finishedAt,
          status: cronRuns.status,
          httpStatus: cronRuns.httpStatus,
          durationMs: cronRuns.durationMs,
          error: cronRuns.error,
        })
        .from(cronRuns)
        .innerJoin(cronJobs, eq(cronJobs.id, cronRuns.jobId))
        .innerJoin(projects, eq(projects.id, cronJobs.projectId))
        .where(
          and(
            eq(cronJobs.projectId, pid),
            jobId ? eq(cronRuns.jobId, jobId) : undefined,
          ),
        )
        .orderBy(desc(cronRuns.startedAt))
        .limit(limit);
      return rows as CronRun[];
    },

    async claim(jobId, scheduledFor, now) {
      const [row] = await db
        .insert(cronRuns)
        .values({ jobId, scheduledFor, startedAt: now })
        .onConflictDoNothing()
        .returning({ id: cronRuns.id });
      return row?.id ?? null;
    },

    async finish(runId, r, now) {
      await db
        .update(cronRuns)
        .set({
          status: r.status,
          httpStatus: r.httpStatus,
          durationMs: r.durationMs,
          error: r.error ? r.error.slice(0, ERROR_MAX) : null,
          finishedAt: now,
        })
        .where(eq(cronRuns.id, runId));
    },

    async livePort(project) {
      const [row] = await db
        .select({ port: deployments.port })
        .from(deployments)
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .where(
          and(
            eq(projects.name, project),
            eq(deployments.environment, "production"),
            eq(deployments.status, "live"),
          ),
        )
        .orderBy(desc(deployments.createdAt))
        .limit(1);
      return row?.port ?? null;
    },

    async cronSecret(project) {
      const [r] = await db
        .select()
        .from(envVars)
        .innerJoin(projects, eq(projects.id, envVars.projectId))
        .where(
          and(
            eq(projects.name, project),
            eq(envVars.environment, "production"),
            eq(envVars.name, "CRON_SECRET"),
          ),
        );
      if (!r) return null;
      const v = r.env_vars;
      return {
        name: v.name,
        secret: v.secret,
        sealed: {
          ciphertext: v.ciphertext,
          iv: v.iv,
          tag: v.tag,
          keyVersion: v.keyVersion,
        },
      };
    },

    async pruneRuns(before) {
      await db.delete(cronRuns).where(lt(cronRuns.startedAt, before));
    },

    async add(project, path, schedule, audit) {
      const pid = await projectId(project);
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(cronJobs)
          .values({ projectId: pid, path, schedule })
          .onConflictDoNothing()
          .returning({
            id: cronJobs.id,
            createdAt: cronJobs.createdAt,
            enabled: cronJobs.enabled,
          });
        if (!row)
          throw new AdminError(
            `${project} already calls ${path} on "${schedule}"`,
          );
        await writeAudit(tx, audit);
        return {
          id: row.id,
          project,
          path,
          schedule,
          enabled: row.enabled,
          createdAt: row.createdAt,
        };
      });
    },

    async remove(project, id, audit) {
      const pid = await projectId(project);
      return db.transaction(async (tx) => {
        const rows = await tx
          .delete(cronJobs)
          .where(and(eq(cronJobs.projectId, pid), eq(cronJobs.id, id)))
          .returning({ id: cronJobs.id });
        if (rows.length === 0) return false;
        await writeAudit(tx, audit);
        return true;
      });
    },

    async setEnabled(project, id, enabled, audit) {
      const pid = await projectId(project);
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(cronJobs)
          .set({ enabled })
          .where(and(eq(cronJobs.projectId, pid), eq(cronJobs.id, id)))
          .returning({ id: cronJobs.id });
        if (rows.length === 0) return false;
        await writeAudit(tx, audit);
        return true;
      });
    },
  };
}
