/** `SwitchRepo` on kit_deploy (Drizzle + postgres.js). */
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  max,
  ne,
  or,
} from "drizzle-orm";
import {
  deployments,
  domains,
  envVars,
  OPEN_STATUSES,
  projects,
} from "@/lib/db/schema";
import { type Db, scopeIs } from "@/lib/db/store";
import type { RunningPreview, SwitchRepo } from "./repo";
import type { SweepRepo } from "./sweep";

const production = eq(deployments.environment, "production");
const preview = eq(deployments.environment, "preview");
/** A preview that serves, or that sleeps (D017): the one row of its PR a new live one replaces. */
const CURRENT = ["live", "asleep"] as const;

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
      // A transaction-level advisory lock, in a transaction open on one reserved connection for
      // the whole switch (minutes, with a pull). Not a session lock: the URL is PgBouncer's, which
      // pools by transaction, so only inside a transaction is the server connection ours. The
      // transaction does no writes (the switch's own queries use the pool); ending it frees the
      // lock even if this process dies. Another process (the CLI) on the same project waits here.
      const conn = await db.$client.reserve();
      const key = `kit-deploy:switch:${projectId}`;
      try {
        await conn`begin`;
        await conn`select pg_advisory_xact_lock(hashtext(${key}))`;
        return await fn();
      } finally {
        await conn`rollback`.catch(() => undefined);
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
            pr: deployments.pr,
          })
          .from(deployments)
          .where(
            and(
              eq(deployments.projectId, projectId),
              eq(deployments.status, "queued"),
            ),
          )
          .orderBy(desc(deployments.createdAt))
          .limit(1)
          .for("update");
        if (!next) return null;
        // An older commit still queued is pointless once a newer one of the same scope (production,
        // or the same PR) deploys.
        await tx
          .update(deployments)
          .set({ status: "superseded", finishedAt: new Date() })
          .where(
            and(
              eq(deployments.projectId, projectId),
              scopeIs({ pr: next.pr }),
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
            repo: projects.repo,
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
          .select({ projectId: deployments.projectId, pr: deployments.pr })
          .from(deployments)
          .where(eq(deployments.id, id));
        if (!me) throw new Error(`deployment ${id} not found`);
        const [previous] = await tx
          .update(deployments)
          .set({ status: "superseded" })
          .where(
            and(
              eq(deployments.projectId, me.projectId),
              scopeIs({ pr: me.pr }),
              // A preview that slept is replaced by its wake-up like a live one.
              inArray(deployments.status, [...CURRENT]),
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

    async envVars(projectId, environment) {
      const rows = await db
        .select()
        .from(envVars)
        .where(
          and(
            eq(envVars.projectId, projectId),
            eq(envVars.environment, environment),
          ),
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
      }));
    },

    async projectByName(name) {
      const [p] = await db
        .select({
          id: projects.id,
          name: projects.name,
          repo: projects.repo,
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

    async runningPreviews(projectId) {
      const rows = await db
        .select({
          id: deployments.id,
          pr: deployments.pr,
          status: deployments.status,
          container: deployments.container,
        })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, projectId),
            preview,
            inArray(deployments.status, [...CURRENT]),
            isNotNull(deployments.container),
          ),
        );
      const prs = [
        ...new Set(rows.flatMap((r) => (r.pr === null ? [] : [r.pr]))),
      ];
      if (prs.length === 0) return [];
      const pushes = await db
        .select({ pr: deployments.pr, at: max(deployments.createdAt) })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, projectId),
            preview,
            inArray(deployments.pr, prs),
          ),
        )
        .groupBy(deployments.pr);
      const lastPush = new Map(pushes.map((p) => [p.pr, p.at]));
      const byPr = new Map<number, RunningPreview>();
      for (const r of rows) {
        if (r.pr === null || !r.container) continue;
        if (r.status !== "live" && r.status !== "asleep") continue;
        // One per PR; the live one wins over an asleep one still holding a container.
        if (byPr.get(r.pr)?.status === "live") continue;
        byPr.set(r.pr, {
          id: r.id,
          pr: r.pr,
          status: r.status,
          container: r.container,
          lastPushAt: lastPush.get(r.pr) ?? new Date(0),
        });
      }
      return [...byPr.values()];
    },

    async markAsleep(id) {
      const rows = await db
        .update(deployments)
        .set({ status: "asleep" })
        .where(
          and(eq(deployments.id, id), preview, eq(deployments.status, "live")),
        )
        .returning({ id: deployments.id });
      return rows.length > 0;
    },

    async closePreview(projectId, pr) {
      return db.transaction(async (tx) => {
        const scope = and(
          eq(deployments.projectId, projectId),
          scopeIs({ pr }),
        );
        await tx
          .update(deployments)
          .set({ status: "superseded", finishedAt: new Date() })
          .where(
            and(
              scope,
              inArray(deployments.status, [...OPEN_STATUSES, "asleep"]),
            ),
          );
        const rows = await tx
          .select({ id: deployments.id, container: deployments.container })
          .from(deployments)
          .where(and(scope, isNotNull(deployments.container)));
        return rows.flatMap((r) =>
          r.container ? [{ id: r.id, container: r.container }] : [],
        );
      });
    },
  };
}

/** `SweepRepo` on kit_deploy: what the nightly sweep compares the machine against. */
export function drizzleSweepRepo(db: Db): SweepRepo {
  const project = {
    id: projects.id,
    name: projects.name,
    repo: projects.repo,
  };
  return {
    async projects() {
      return db.select(project).from(projects).orderBy(asc(projects.name));
    },

    async previewPrs() {
      const rows = await db
        .selectDistinct({ ...project, pr: deployments.pr })
        .from(deployments)
        .innerJoin(projects, eq(projects.id, deployments.projectId))
        .where(
          and(
            preview,
            or(
              inArray(deployments.status, [...OPEN_STATUSES, "asleep"]),
              isNotNull(deployments.container),
            ),
          ),
        )
        .orderBy(asc(projects.name), asc(deployments.pr));
      return rows.flatMap((r) =>
        r.pr === null
          ? []
          : [{ project: { id: r.id, name: r.name, repo: r.repo }, pr: r.pr }],
      );
    },

    async holds(projectId) {
      const rows = await db
        .select({
          pr: deployments.pr,
          status: deployments.status,
          container: deployments.container,
        })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, projectId),
            or(
              isNotNull(deployments.container),
              and(preview, inArray(deployments.status, [...CURRENT])),
            ),
          ),
        );
      const containers = new Set<string>();
      const prs = new Set<number>();
      for (const r of rows) {
        if (r.container) containers.add(r.container);
        if (r.pr !== null && (r.status === "live" || r.status === "asleep"))
          prs.add(r.pr);
      }
      return { containers: [...containers], prs: [...prs] };
    },
  };
}
