/**
 * Registering projects, their domains and their deploy tokens (CLI on the VPS; later the
 * dashboard). Behind an interface so the commands are tested without Postgres.
 */
import { eq } from "drizzle-orm";
import { type AuditEntry, writeAudit } from "./audit";
import { type DomainRedirect, deployTokens, domains, projects } from "./schema";
import type { Db } from "./store";

export type NewProject = {
  name: string;
  repo: string;
  memoryMb: number;
  hosts: string[];
  /** `main` when absent (the column's default). */
  productionBranch?: string;
};

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

/** Each write takes its audit row (D045), committed in the same transaction; the CLI's calls pass
 * none yet. */
export interface AdminStore {
  /** The project and its domains, in one transaction. */
  addProject(p: NewProject, audit?: AuditEntry): Promise<{ id: string }>;
  /** A new host waits in `pending_dns` until `domain check` sees it point to the VPS (D028). */
  addDomain(
    project: string,
    host: string,
    redirect?: DomainRedirect,
    audit?: AuditEntry,
  ): Promise<void>;
  /** The project's `owner/name`, or null when there is no such project. */
  projectRepo(project: string): Promise<string | null>;
  /** The branch production deploys from (`main` unless set), or null for no such project. */
  productionBranch(project: string): Promise<string | null>;
  /** Stores the hash of a token for the project; the token itself never reaches the database. */
  addToken(
    project: string,
    tokenHash: string,
    label: string,
    audit?: AuditEntry,
  ): Promise<{ id: string }>;
}

/** Postgres' code for a unique violation, wherever Drizzle put the driver's error. */
function isUnique(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
}

export function drizzleAdminStore(db: Db): AdminStore {
  const projectId = async (name: string) => {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, name));
    if (!p) throw new AdminError(`no project ${name}`);
    return p.id;
  };

  return {
    async addProject(p, audit) {
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(projects)
            .values({
              name: p.name,
              repo: p.repo,
              memoryMb: p.memoryMb,
              ...(p.productionBranch
                ? { productionBranch: p.productionBranch }
                : {}),
            })
            .returning({ id: projects.id });
          if (!row) throw new Error("insert returned no row");
          if (p.hosts.length) {
            await tx
              .insert(domains)
              .values(p.hosts.map((host) => ({ projectId: row.id, host })));
          }
          if (audit) await writeAudit(tx, audit);
          return row;
        });
      } catch (e) {
        if (isUnique(e)) {
          throw new AdminError(
            `a project named ${p.name}, its repo or one of its domains already exists`,
          );
        }
        throw e;
      }
    },

    async addDomain(project, host, redirect = "none", audit) {
      const id = await projectId(project);
      try {
        await db.transaction(async (tx) => {
          await tx.insert(domains).values({ projectId: id, host, redirect });
          if (audit) await writeAudit(tx, audit);
        });
      } catch (e) {
        if (isUnique(e))
          throw new AdminError(`${host} already belongs to a project`);
        throw e;
      }
    },

    async projectRepo(project) {
      const [p] = await db
        .select({ repo: projects.repo })
        .from(projects)
        .where(eq(projects.name, project));
      return p?.repo ?? null;
    },

    async productionBranch(project) {
      const [p] = await db
        .select({ branch: projects.productionBranch })
        .from(projects)
        .where(eq(projects.name, project));
      return p?.branch ?? null;
    },

    async addToken(project, tokenHash, label, audit) {
      const id = await projectId(project);
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(deployTokens)
          .values({ projectId: id, tokenHash, label })
          .returning({ id: deployTokens.id });
        if (!row) throw new Error("insert returned no row");
        if (audit) await writeAudit(tx, audit);
        return row;
      });
    },
  };
}
