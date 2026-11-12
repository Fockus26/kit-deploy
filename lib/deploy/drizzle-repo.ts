/** `SwitchRepo` on kit_deploy (Drizzle + postgres.js). */
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { deployments, domains, projects } from "@/lib/db/schema";
import type { Db } from "@/lib/db/store";
import type { SwitchRepo } from "./repo";

const production = eq(deployments.environment, "production");

export function drizzleSwitchRepo(db: Db): SwitchRepo {
  const hostsOf = async (projectId: string) =>
    (
      await db
        .select({ host: domains.host })
        .from(domains)
        .where(eq(domains.projectId, projectId))
        .orderBy(asc(domains.host))
    ).map((r) => r.host);

  return {
    async withProjectLock(projectId, fn) {
      // A session-level advisory lock on one reserved connection: held for the whole switch
      // (minutes, with a pull) without keeping a transaction open. Another process (the CLI)
      // waiting on the same project blocks here until this one is done.
      const conn = await db.$client.reserve();
      const key = `kit-deploy:switch:${projectId}`;
      try {
        await conn`select pg_advisory_lock(hashtext(${key}))`;
        return await fn();
      } finally {
        await conn`select pg_advisory_unlock(hashtext(${key}))`.catch(
          () => undefined,
        );
        conn.release();
      }
    },

    async claimNext(projectId) {
      return db.transaction(async (tx) => {
        const [next] = await tx
          .select({
            id: deployments.id,
            sha: deployments.sha,
            image: deployments.image,
          })
          .from(deployments)
          .where(
            and(
              eq(deployments.projectId, projectId),
              production,
              eq(deployments.status, "queued"),
            ),
          )
          .orderBy(desc(deployments.createdAt))
          .limit(1)
          .for("update");
        if (!next) return null;
        // An older commit still queued is pointless once a newer one deploys.
        await tx
          .update(deployments)
          .set({ status: "superseded", finishedAt: new Date() })
          .where(
            and(
              eq(deployments.projectId, projectId),
              production,
              eq(deployments.status, "queued"),
              ne(deployments.id, next.id),
            ),
          );
        await tx
          .update(deployments)
          .set({ status: "starting" })
          .where(eq(deployments.id, next.id));
        const [p] = await tx
          .select({
            id: projects.id,
            name: projects.name,
            memoryMb: projects.memoryMb,
          })
          .from(projects)
          .where(eq(projects.id, projectId));
        if (!p) return null;
        return { ...next, project: p, hosts: await hostsOf(projectId) };
      });
    },

    async markLive(id, container, port) {
      return db.transaction(async (tx) => {
        const [me] = await tx
          .select({ projectId: deployments.projectId })
          .from(deployments)
          .where(eq(deployments.id, id));
        if (!me) throw new Error(`deployment ${id} not found`);
        const [previous] = await tx
          .update(deployments)
          .set({ status: "superseded" })
          .where(
            and(
              eq(deployments.projectId, me.projectId),
              production,
              eq(deployments.status, "live"),
              ne(deployments.id, id),
            ),
          )
          .returning({ id: deployments.id, container: deployments.container });
        await tx
          .update(deployments)
          .set({
            status: "live",
            container,
            port,
            error: null,
            finishedAt: new Date(),
          })
          .where(eq(deployments.id, id));
        return previous ?? null;
      });
    },

    async markFailed(id, error) {
      await db
        .update(deployments)
        .set({
          status: "failed",
          error: error.slice(0, 2000),
          finishedAt: new Date(),
        })
        .where(eq(deployments.id, id));
    },

    async listKept(projectId) {
      const rows = await db
        .select({
          id: deployments.id,
          sha: deployments.sha,
          status: deployments.status,
          container: deployments.container,
          port: deployments.port,
          createdAt: deployments.createdAt,
        })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, projectId),
            production,
            isNotNull(deployments.container),
          ),
        )
        .orderBy(desc(deployments.createdAt));
      return rows.flatMap((r) =>
        r.container ? [{ ...r, container: r.container }] : [],
      );
    },

    async clearContainer(id) {
      await db
        .update(deployments)
        .set({ container: null, port: null })
        .where(eq(deployments.id, id));
    },

    async projectByName(name) {
      const [p] = await db
        .select({
          id: projects.id,
          name: projects.name,
          memoryMb: projects.memoryMb,
        })
        .from(projects)
        .where(eq(projects.name, name));
      return p ? { ...p, hosts: await hostsOf(p.id) } : null;
    },

    async liveSites() {
      const rows = await db
        .select({
          deploymentId: deployments.id,
          project: projects.name,
          projectId: projects.id,
          container: deployments.container,
          port: deployments.port,
        })
        .from(deployments)
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .where(and(production, eq(deployments.status, "live")))
        .orderBy(asc(projects.name));
      const out = [];
      for (const r of rows) {
        if (!r.container || r.port === null) continue;
        out.push({
          deploymentId: r.deploymentId,
          project: r.project,
          hosts: await hostsOf(r.projectId),
          container: r.container,
          port: r.port,
        });
      }
      return out;
    },
  };
}
