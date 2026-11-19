/**
 * The panel's reads from kit_deploy that no other store has (projects with their deployments,
 * passkeys, the audit log). Server only: it opens the database (D012). Never a secret's value:
 * env_vars and the auth secrets are not read here. Behind an interface so the readers are tested
 * without Postgres.
 */
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  auditLog,
  authPasskey,
  authUser,
  type DeploymentStatus,
  deployments,
  projects,
} from "@/lib/db/schema";
import { type Db, scopeIs } from "@/lib/db/store";

export type ProjectRow = {
  id: string;
  name: string;
  repo: string;
  productionBranch: string;
  memoryMb: number;
  createdAt: Date;
};

export type DeploymentRow = {
  id: string;
  projectId: string;
  environment: "production" | "preview";
  pr: number | null;
  sha: string;
  generation: number;
  image: string;
  status: DeploymentStatus;
  container: string | null;
  port: number | null;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

export type DeploymentFilter = {
  environment?: "production" | "preview";
  status?: DeploymentStatus;
  limit?: number;
};

export type PasskeyRow = {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: Date | null;
};

export type AuditRow = {
  id: string;
  at: Date;
  actor: string;
  action: string;
  project: string;
  environment: string | null;
  name: string | null;
};

export const MAX_DEPLOYMENTS = 100;
/** Ajustes › Auditoría shows this many rows per page (D063). */
export const AUDIT_PAGE = 20;

export interface PanelStore {
  projects(): Promise<ProjectRow[]>;
  project(name: string): Promise<ProjectRow | null>;
  /** Newest first. */
  deployments(
    projectId: string,
    filter?: DeploymentFilter,
  ): Promise<DeploymentRow[]>;
  /** Per project: its newest production deployment and its live one (Inicio's table). */
  productionHeads(): Promise<
    Map<string, { latest: DeploymentRow | null; live: DeploymentRow | null }>
  >;
  deployment(projectId: string, id: string): Promise<DeploymentRow | null>;
  /** A queued or starting deployment of the scope (production, or one PR). */
  openDeployment(
    projectName: string,
    pr: number | null,
  ): Promise<{ id: string; sha: string; generation: number } | null>;
  passkeys(userId: string): Promise<PasskeyRow[]>;
  twoFactorEnabled(userId: string): Promise<boolean>;
  /** Newest first; `offset` rows skipped (D063: page N skips (N - 1) × AUDIT_PAGE). */
  audit(opts?: { offset?: number; limit?: number }): Promise<AuditRow[]>;
  /** How many audit rows there are in all (the page count). */
  auditCount(): Promise<number>;
}

const DEPLOYMENT = {
  id: deployments.id,
  projectId: deployments.projectId,
  environment: deployments.environment,
  pr: deployments.pr,
  sha: deployments.sha,
  generation: deployments.generation,
  image: deployments.image,
  status: deployments.status,
  container: deployments.container,
  port: deployments.port,
  error: deployments.error,
  createdAt: deployments.createdAt,
  finishedAt: deployments.finishedAt,
};

const PROJECT = {
  id: projects.id,
  name: projects.name,
  repo: projects.repo,
  productionBranch: projects.productionBranch,
  memoryMb: projects.memoryMb,
  createdAt: projects.createdAt,
};

export function drizzlePanelStore(db: Db): PanelStore {
  return {
    async projects() {
      return db.select(PROJECT).from(projects).orderBy(asc(projects.name));
    },

    async project(name) {
      const [row] = await db
        .select(PROJECT)
        .from(projects)
        .where(eq(projects.name, name))
        .limit(1);
      return row ?? null;
    },

    async deployments(projectId, filter = {}) {
      const where = [eq(deployments.projectId, projectId)];
      if (filter.environment)
        where.push(eq(deployments.environment, filter.environment));
      if (filter.status) where.push(eq(deployments.status, filter.status));
      return db
        .select(DEPLOYMENT)
        .from(deployments)
        .where(and(...where))
        .orderBy(desc(deployments.createdAt))
        .limit(Math.min(filter.limit ?? MAX_DEPLOYMENTS, MAX_DEPLOYMENTS));
    },

    async productionHeads() {
      const production = eq(deployments.environment, "production");
      const latest = await db
        .selectDistinctOn([deployments.projectId], DEPLOYMENT)
        .from(deployments)
        .where(production)
        .orderBy(deployments.projectId, desc(deployments.createdAt));
      const live = await db
        .select(DEPLOYMENT)
        .from(deployments)
        .where(and(production, eq(deployments.status, "live")));
      const out = new Map<
        string,
        { latest: DeploymentRow | null; live: DeploymentRow | null }
      >();
      for (const d of latest) out.set(d.projectId, { latest: d, live: null });
      for (const d of live) {
        const head = out.get(d.projectId) ?? { latest: d, live: null };
        head.live = d;
        out.set(d.projectId, head);
      }
      return out;
    },

    async deployment(projectId, id) {
      const [row] = await db
        .select(DEPLOYMENT)
        .from(deployments)
        .where(
          and(eq(deployments.projectId, projectId), eq(deployments.id, id)),
        )
        .limit(1);
      return row ?? null;
    },

    async openDeployment(projectName, pr) {
      const [row] = await db
        .select({
          id: deployments.id,
          sha: deployments.sha,
          generation: deployments.generation,
        })
        .from(deployments)
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .where(
          and(
            eq(projects.name, projectName),
            scopeIs({ pr }),
            inArray(deployments.status, ["queued", "starting"]),
          ),
        )
        .orderBy(desc(deployments.createdAt))
        .limit(1);
      return row ?? null;
    },

    async passkeys(userId) {
      return db
        .select({
          id: authPasskey.id,
          name: authPasskey.name,
          deviceType: authPasskey.deviceType,
          backedUp: authPasskey.backedUp,
          createdAt: authPasskey.createdAt,
        })
        .from(authPasskey)
        .where(eq(authPasskey.userId, userId))
        .orderBy(asc(authPasskey.createdAt));
    },

    async twoFactorEnabled(userId) {
      const [row] = await db
        .select({ on: authUser.twoFactorEnabled })
        .from(authUser)
        .where(eq(authUser.id, userId))
        .limit(1);
      return row?.on === true;
    },

    async audit(opts = {}) {
      return db
        .select({
          id: auditLog.id,
          at: auditLog.at,
          actor: auditLog.actor,
          action: auditLog.action,
          project: auditLog.project,
          environment: auditLog.environment,
          name: auditLog.name,
        })
        .from(auditLog)
        .orderBy(desc(auditLog.at), desc(auditLog.id))
        .limit(Math.min(opts.limit ?? AUDIT_PAGE, AUDIT_PAGE))
        .offset(Math.max(opts.offset ?? 0, 0));
    },

    async auditCount() {
      const [row] = await db.select({ n: count() }).from(auditLog);
      return row?.n ?? 0;
    },
  };
}
