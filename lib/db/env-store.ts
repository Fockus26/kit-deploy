/**
 * A project's variables (brief F4) as rows of sealed blobs: this store never sees a value, only
 * what kit-agent's `env.seal` returned. Every change writes its audit row in the same transaction.
 * Behind an interface so the CLI (and later the dashboard) are tested without Postgres.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Sealed } from "../core/crypto";
import type { Environment } from "../core/env";
import { AdminError } from "./admin";
import { auditLog, envVars, projects } from "./schema";
import type { Db } from "./store";

export type StoredVar = {
  name: string;
  secret: boolean;
  sealed: Sealed;
  updatedAt: Date;
  updatedBy: string;
};

export interface EnvStore {
  /** By name. Throws AdminError for an unknown project. */
  list(project: string, environment: Environment): Promise<StoredVar[]>;
  /** Insert or replace; `created` says which. */
  set(
    project: string,
    environment: Environment,
    v: { name: string; secret: boolean; sealed: Sealed },
    actor: string,
  ): Promise<{ created: boolean }>;
  /** False when there was nothing to remove (and then no audit row). */
  remove(
    project: string,
    environment: Environment,
    name: string,
    actor: string,
  ): Promise<boolean>;
}

/** `ssh:<user>` for the audit log, from the SSH session's user (sudo keeps the real one). */
export function sshActor(
  env: Record<string, string | undefined> = process.env,
): string {
  const user = env.SUDO_USER || env.USER || env.LOGNAME || "";
  return /^[A-Za-z0-9_.@-]{1,64}$/.test(user) ? `ssh:${user}` : "ssh:unknown";
}

export function drizzleEnvStore(db: Db): EnvStore {
  const projectId = async (name: string) => {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.name, name));
    if (!p) throw new AdminError(`no project ${name}`);
    return p.id;
  };

  return {
    async list(project, environment) {
      const id = await projectId(project);
      const rows = await db
        .select()
        .from(envVars)
        .where(
          and(eq(envVars.projectId, id), eq(envVars.environment, environment)),
        )
        .orderBy(asc(envVars.name));
      return rows.map((r) => ({
        name: r.name,
        secret: r.secret,
        sealed: {
          ciphertext: r.ciphertext,
          iv: r.iv,
          tag: r.tag,
          keyVersion: r.keyVersion,
        },
        updatedAt: r.updatedAt,
        updatedBy: r.updatedBy,
      }));
    },

    async set(project, environment, v, actor) {
      const id = await projectId(project);
      return db.transaction(async (tx) => {
        const values = {
          secret: v.secret,
          ciphertext: v.sealed.ciphertext,
          iv: v.sealed.iv,
          tag: v.sealed.tag,
          keyVersion: v.sealed.keyVersion,
          updatedAt: new Date(),
          updatedBy: actor,
        };
        const [row] = await tx
          .insert(envVars)
          .values({ projectId: id, environment, name: v.name, ...values })
          .onConflictDoUpdate({
            target: [envVars.projectId, envVars.environment, envVars.name],
            set: values,
          })
          // xmax = 0 only on a row this statement inserted (Postgres' upsert idiom).
          .returning({ created: sql<boolean>`(xmax = 0)` });
        await tx.insert(auditLog).values({
          actor,
          action: "env.set",
          project,
          environment,
          name: v.name,
        });
        return { created: row?.created === true };
      });
    },

    async remove(project, environment, name, actor) {
      const id = await projectId(project);
      return db.transaction(async (tx) => {
        const gone = await tx
          .delete(envVars)
          .where(
            and(
              eq(envVars.projectId, id),
              eq(envVars.environment, environment),
              eq(envVars.name, name),
            ),
          )
          .returning({ id: envVars.id });
        if (gone.length === 0) return false;
        await tx.insert(auditLog).values({
          actor,
          action: "env.remove",
          project,
          environment,
          name,
        });
        return true;
      });
    },
  };
}
