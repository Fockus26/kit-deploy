/**
 * `kit-deploy project rm` (D059): a project's rows. Deleting `projects` takes its deployments,
 * domains, variables, deploy tokens and cron jobs (and their runs) with it (`on delete cascade`).
 * Alerts are by name and outlive the project like the audit log: its open ones are closed without
 * an email, and its alert checks' streaks go. The audit row commits in the same transaction.
 * Kept: the audit log, the closed alerts and the metric samples (they age out in 30 days).
 */
import { and, count, countDistinct, eq, inArray, isNull } from "drizzle-orm";
import { type AuditEntry, writeAudit } from "./audit";
import {
  alertChecks,
  alerts,
  cronJobs,
  deployments,
  deployTokens,
  domains,
  envVars,
  projects,
} from "./schema";
import type { Db } from "./store";

/** What the database holds for a project: names and counts only, never a value. */
export type ProjectFootprint = {
  repo: string;
  deployments: number;
  /** Distinct PRs with a preview deployment. */
  previews: number;
  hosts: string[];
  variables: number;
  tokens: number;
  cronJobs: number;
  openAlerts: number;
};

export interface ProjectRemovalStore {
  /** null when there is no such project. */
  footprint(project: string): Promise<ProjectFootprint | null>;
  /** The rows gone and `audit` written, in one transaction; false when there was no project. */
  remove(project: string, audit: AuditEntry): Promise<boolean>;
  /** The audit row alone: the project's rows were already gone, its machine leftovers were not. */
  record(audit: AuditEntry): Promise<void>;
}

/** The alert checks whose subject is this project (lib/alerts/checks.ts keys). */
export function alertCheckKeys(project: string, hosts: string[]): string[] {
  return [
    `site_down:${project}`,
    `deploy_failed:${project}`,
    ...hosts.map((h) => `cert:${h}`),
  ];
}

export function drizzleProjectRemovalStore(db: Db): ProjectRemovalStore {
  return {
    async footprint(project) {
      const [p] = await db
        .select({ id: projects.id, repo: projects.repo })
        .from(projects)
        .where(eq(projects.name, project));
      if (!p) return null;
      const [deps] = await db
        .select({ n: count(), previews: countDistinct(deployments.pr) })
        .from(deployments)
        .where(eq(deployments.projectId, p.id));
      const hosts = await db
        .select({ host: domains.host })
        .from(domains)
        .where(eq(domains.projectId, p.id))
        .orderBy(domains.host);
      const [vars] = await db
        .select({ n: count() })
        .from(envVars)
        .where(eq(envVars.projectId, p.id));
      const [tokens] = await db
        .select({ n: count() })
        .from(deployTokens)
        .where(eq(deployTokens.projectId, p.id));
      const [jobs] = await db
        .select({ n: count() })
        .from(cronJobs)
        .where(eq(cronJobs.projectId, p.id));
      const [open] = await db
        .select({ n: count() })
        .from(alerts)
        .where(and(eq(alerts.project, project), isNull(alerts.resolvedAt)));
      return {
        repo: p.repo,
        deployments: deps?.n ?? 0,
        previews: deps?.previews ?? 0,
        hosts: hosts.map((h) => h.host),
        variables: vars?.n ?? 0,
        tokens: tokens?.n ?? 0,
        cronJobs: jobs?.n ?? 0,
        openAlerts: open?.n ?? 0,
      };
    },

    async remove(project, audit) {
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.name, project))
          .for("update");
        if (!p) return false;
        const hosts = await tx
          .select({ host: domains.host })
          .from(domains)
          .where(eq(domains.projectId, p.id));
        const now = new Date();
        // Closed, not deleted: the incident is history. Marked notified: no "resolved" email.
        await tx
          .update(alerts)
          .set({ resolvedAt: now, resolvedNotifiedAt: now })
          .where(and(eq(alerts.project, project), isNull(alerts.resolvedAt)));
        await tx.delete(alertChecks).where(
          inArray(
            alertChecks.key,
            alertCheckKeys(
              project,
              hosts.map((h) => h.host),
            ),
          ),
        );
        await tx.delete(projects).where(eq(projects.id, p.id));
        await writeAudit(tx, audit);
        return true;
      });
    },

    record: (audit) => writeAudit(db, audit),
  };
}
