/**
 * The first slice of D012's data model: projects, their deployments and the per-repo deploy
 * tokens. Caddy files and containers are generated from these rows (`kit-deploy regenerate`).
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The kit-db name (brief F1), also the container and site name prefix. */
    name: text("name").notNull().unique(),
    /** GitHub `owner/name`; the image is `ghcr.io/<repo>:<sha>`. */
    repo: text("repo").notNull().unique(),
    productionBranch: text("production_branch").notNull().default("main"),
    /** D017: production 256–512 MB. */
    memoryMb: integer("memory_mb").notNull().default(512),
    createdAt: createdAt(),
  },
  (t) => [
    check("projects_name_format", sql`${t.name} ~ '^[a-z0-9][a-z0-9_]{0,39}$'`),
    check(
      "projects_repo_format",
      // Neither part may start with `.`: no `..`, and Docker refuses such a path anyway.
      sql`${t.repo} ~ '^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$'`,
    ),
    check("projects_memory_range", sql`${t.memoryMb} between 128 and 2048`),
  ],
);

export const DEPLOYMENT_STATUSES = [
  "queued",
  "starting",
  "live",
  "failed",
  "superseded",
] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];
/** A deployment that is or will be serving: a new request for the same commit gets it back. */
export const OPEN_STATUSES = [
  "queued",
  "starting",
  "live",
] as const satisfies readonly DeploymentStatus[];

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment", {
      enum: ["production", "preview"],
    }).notNull(),
    /** The PR number of a preview; null in production. */
    pr: integer("pr"),
    sha: text("sha").notNull(),
    image: text("image").notNull(),
    status: text("status", { enum: DEPLOYMENT_STATUSES })
      .notNull()
      .default("queued"),
    /** Filled by the switch once the container starts. */
    container: text("container"),
    port: integer("port"),
    /** Why it failed, for the dashboard. Never a secret. */
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("deployments_project_created").on(t.projectId, t.createdAt.desc()),
    // One open deployment per commit: two concurrent retries of the Action cannot queue twice.
    uniqueIndex("deployments_open_commit")
      .on(t.projectId, t.environment, t.sha)
      .where(
        sql.raw(`status in (${OPEN_STATUSES.map((s) => `'${s}'`).join(", ")})`),
      ),
    check("deployments_sha_format", sql`${t.sha} ~ '^[0-9a-f]{40}$'`),
    // Drizzle's text enums are TypeScript-only: the database enforces them too.
    check(
      "deployments_environment",
      sql`${t.environment} in ('production', 'preview')`,
    ),
    check(
      "deployments_status",
      sql.raw(
        `status in (${DEPLOYMENT_STATUSES.map((s) => `'${s}'`).join(", ")})`,
      ),
    ),
    check(
      "deployments_pr_matches_env",
      sql`(${t.environment} = 'preview') = (${t.pr} is not null)`,
    ),
  ],
);

export const deployTokens = pgTable(
  "deploy_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** sha256 of the token; the token itself is shown once and never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull().default(""),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    check("deploy_tokens_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

/** The hosts a project's production answers on. A preview's host is derived (D001), not stored. */
export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Lowercase DNS name; one project per host. */
    host: text("host").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "domains_host_format",
      sql`${t.host} ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'`,
    ),
    check(
      "domains_not_platform",
      sql`${t.host} not in ('db.fockus.dev', 'deploy.fockus.dev')`,
    ),
  ],
);
