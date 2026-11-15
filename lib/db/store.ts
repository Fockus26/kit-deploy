/**
 * What the deploy API needs from the database, behind an interface so the handler is tested
 * without Postgres. `drizzleStore()` is the real one (kit_deploy on kit-db, D012).
 */
import { and, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import {
  type DeploymentStatus,
  deployments,
  deployTokens,
  OPEN_STATUSES,
  projects,
} from "./schema";

export type TokenProject = {
  tokenId: string;
  project: { id: string; name: string; repo: string };
};

export type DeploymentRef = {
  id: string;
  status: DeploymentStatus;
  image: string;
};

/** Production, or the preview of one PR. */
export type NewDeployment =
  | { projectId: string; environment: "production"; sha: string; image: string }
  | {
      projectId: string;
      environment: "preview";
      pr: number;
      sha: string;
      image: string;
    };

/** Which deployments a commit is compared against: production's, or one PR's. */
export type DeploymentScope = { pr: number | null };

export interface DeployStore {
  /** The project of an active (not revoked) token, by the token's hash. */
  findTokenProject(tokenHash: string): Promise<TokenProject | null>;
  touchToken(tokenId: string): Promise<void>;
  /** A deployment of the same commit, in the same scope (production or that PR), that is queued,
   * starting or live: a retry gets it back. */
  findOpenDeployment(
    projectId: string,
    scope: DeploymentScope,
    sha: string,
  ): Promise<DeploymentRef | null>;
  /** null when an open deployment of the same commit already exists (a concurrent retry). */
  createDeployment(d: NewDeployment): Promise<DeploymentRef | null>;
}

/** With the postgres.js client: the switch reserves a connection for its advisory lock. */
export type Db = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

let shared: Db | null = null;

/** One pool per process, opened on first use (never at build time). */
export function db(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    shared = drizzle(postgres(url, { max: 5 }), { schema });
  }
  return shared;
}

/** Production's rows, or one PR's preview rows. */
export function scopeIs(scope: DeploymentScope): SQL {
  return scope.pr === null
    ? sql`${deployments.environment} = 'production' and ${deployments.pr} is null`
    : sql`${deployments.environment} = 'preview' and ${deployments.pr} = ${scope.pr}`;
}

export function drizzleStore(database: Db = db()): DeployStore {
  return {
    async findTokenProject(tokenHash) {
      const rows = await database
        .select({
          tokenId: deployTokens.id,
          id: projects.id,
          name: projects.name,
          repo: projects.repo,
        })
        .from(deployTokens)
        .innerJoin(projects, eq(projects.id, deployTokens.projectId))
        .where(
          and(
            eq(deployTokens.tokenHash, tokenHash),
            isNull(deployTokens.revokedAt),
          ),
        )
        .limit(1);
      const r = rows[0];
      return r
        ? {
            tokenId: r.tokenId,
            project: { id: r.id, name: r.name, repo: r.repo },
          }
        : null;
    },

    async touchToken(tokenId) {
      await database
        .update(deployTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(deployTokens.id, tokenId));
    },

    async findOpenDeployment(projectId, scope, sha) {
      const rows = await database
        .select({
          id: deployments.id,
          status: deployments.status,
          image: deployments.image,
        })
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, projectId),
            scopeIs(scope),
            eq(deployments.sha, sha),
            inArray(deployments.status, [...OPEN_STATUSES]),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async createDeployment(d) {
      const rows = await database
        .insert(deployments)
        .values(d)
        // The partial unique index `deployments_open_commit` (an expression index, so no target:
        // the only other unique key is the random id): a concurrent twin wins, we get null.
        .onConflictDoNothing()
        .returning({
          id: deployments.id,
          status: deployments.status,
          image: deployments.image,
        });
      return rows[0] ?? null;
    },
  };
}
