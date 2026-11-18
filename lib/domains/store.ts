/**
 * A project's domains as `domain ls|rm|redirect|check` and the dashboard read and change them.
 * Behind an interface so the commands and the check are tested without Postgres.
 */
import { and, asc, eq } from "drizzle-orm";
import { AdminError } from "../db/admin";
import { type AuditEntry, writeAudit } from "../db/audit";
import {
  DOMAIN_ERROR_MAX,
  type DomainRedirect,
  type DomainStatus,
  domains,
  projects,
} from "../db/schema";
import type { Db } from "../db/store";

export type DomainRow = {
  id: string;
  project: string;
  host: string;
  redirect: DomainRedirect;
  status: DomainStatus;
  dnsCheckedAt: Date | null;
  dnsOkAt: Date | null;
  certNotAfter: Date | null;
  lastError: string | null;
  createdAt: Date;
};

/** What a check writes back; absent fields are left as they are. */
export type DomainPatch = Partial<
  Pick<
    DomainRow,
    "status" | "dnsCheckedAt" | "dnsOkAt" | "certNotAfter" | "lastError"
  >
>;

export interface DomainStore {
  /** Every domain, or one project's; by project then host. Throws AdminError for an unknown
   * project. */
  list(project?: string): Promise<DomainRow[]>;
  setRedirect(
    project: string,
    host: string,
    redirect: DomainRedirect,
  ): Promise<boolean>;
  /** False when the project has no such host. `audit` is written, in the same transaction, only
   * when a row went (D045). */
  remove(project: string, host: string, audit?: AuditEntry): Promise<boolean>;
  update(id: string, patch: DomainPatch): Promise<void>;
}

/** `last_error` is bounded in the table too; cut here so a long message never fails the write. */
export function shortError(message: string): string {
  const one = message.replace(/\s+/g, " ").trim();
  return one.length > DOMAIN_ERROR_MAX
    ? `${one.slice(0, DOMAIN_ERROR_MAX - 1)}…`
    : one;
}

export function drizzleDomainStore(db: Db): DomainStore {
  const projectId = async (name: string) => {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, name));
    if (!p) throw new AdminError(`no project ${name}`);
    return p.id;
  };

  return {
    async list(project) {
      const where =
        project === undefined
          ? undefined
          : eq(domains.projectId, await projectId(project));
      return db
        .select({
          id: domains.id,
          project: projects.name,
          host: domains.host,
          redirect: domains.redirect,
          status: domains.status,
          dnsCheckedAt: domains.dnsCheckedAt,
          dnsOkAt: domains.dnsOkAt,
          certNotAfter: domains.certNotAfter,
          lastError: domains.lastError,
          createdAt: domains.createdAt,
        })
        .from(domains)
        .innerJoin(projects, eq(projects.id, domains.projectId))
        .where(where)
        .orderBy(asc(projects.name), asc(domains.host));
    },

    async setRedirect(project, host, redirect) {
      const rows = await db
        .update(domains)
        .set({ redirect })
        .where(
          and(
            eq(domains.projectId, await projectId(project)),
            eq(domains.host, host),
          ),
        )
        .returning({ id: domains.id });
      return rows.length > 0;
    },

    async remove(project, host, audit) {
      const id = await projectId(project);
      return db.transaction(async (tx) => {
        const rows = await tx
          .delete(domains)
          .where(and(eq(domains.projectId, id), eq(domains.host, host)))
          .returning({ id: domains.id });
        if (rows.length === 0) return false;
        if (audit) await writeAudit(tx, audit);
        return true;
      });
    },

    async update(id, patch) {
      const set = {
        ...patch,
        ...(patch.lastError ? { lastError: shortError(patch.lastError) } : {}),
      };
      await db.update(domains).set(set).where(eq(domains.id, id));
    },
  };
}
