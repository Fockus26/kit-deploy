/**
 * The first slice of D012's data model: projects, their deployments and the per-repo deploy
 * tokens. Caddy files and containers are generated from these rows (`kit-deploy regenerate`).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
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
    // One open deployment per commit and target (production, or one PR): two concurrent retries
    // of the Action cannot queue twice. `coalesce`: production's null PR must collide with itself.
    uniqueIndex("deployments_open_commit")
      .on(t.projectId, t.environment, sql`coalesce(${t.pr}, 0)`, t.sha)
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
    check("deployments_pr_range", sql`${t.pr} between 1 and 999999`),
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

// ── Better Auth (D003) ──────────────────────────────────────────────────────────────────────
// Better Auth's tables, by its field names (the Drizzle adapter maps by these keys) and with
// snake_case columns. `tests/unit/auth-schema.test.ts` checks them against what Better Auth asks
// for with the plugins in `lib/auth/config.ts`. Ids are text: Better Auth generates them.

const authTimestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Lowercase; there is no sign-up: rows come from `kit-deploy user create`. */
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  ...authTimestamps(),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** The cookie's value. */
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    /** Set only on a session opened by an enrolment link: until then it may register a passkey
     * and TOTP, and it is never a dashboard session (`lib/auth/session.ts`). */
    enrolUntil: timestamp("enrol_until", { withTimezone: true }),
    ...authTimestamps(),
  },
  (t) => [index("auth_session_user").on(t.userId)],
);

/** Unused (no password, no social login) but Better Auth reads it. */
export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...authTimestamps(),
  },
  (t) => [index("auth_account_user").on(t.userId)],
);

/** Better Auth's short-lived values: the TOTP sign-in challenge, its attempt counter, WebAuthn
 * challenges. */
export const authVerification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...authTimestamps(),
  },
  (t) => [index("auth_verification_identifier").on(t.identifier)],
);

export const authPasskey = pgTable(
  "auth_passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull().unique(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    aaguid: text("aaguid"),
  },
  (t) => [index("auth_passkey_user").on(t.userId)],
);

/** The TOTP secret and the recovery codes, both encrypted by Better Auth with the auth secret. */
export const authTwoFactor = pgTable(
  "auth_two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("auth_two_factor_user").on(t.userId)],
);

/** One-time enrolment links (`kit-deploy user create|enrol`). Like deploy_tokens, only the sha256
 * of the token is stored; it is used once and expires in minutes. */
export const enrolmentTokens = pgTable(
  "enrolment_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "enrolment_tokens_hash_format",
      sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    index("enrolment_tokens_user").on(t.userId),
  ],
);

/** D013 step 1: a one-time grant /preview-access issues to a signed-in dashboard user, carried to
 * the preview host in a form POST (never in a URL, so never in Caddy's access log). Bound to the
 * preview host it was issued for; used once, within a minute. */
export const previewGrants = pgTable(
  "preview_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** `kd-hello-pr-7.preview.fockus.dev`: the exchange must arrive on this host. */
    host: text("host").notNull(),
    /** Path + query to land on after the exchange (same host). */
    path: text("path").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("preview_grants_hash_format", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    index("preview_grants_expires").on(t.expiresAt),
  ],
);

/** D013 step 2: the `kd_preview` cookie (Domain .preview.fockus.dev, 12 h). Only its sha256 is
 * stored; Caddy's forward_auth asks /api/v1/preview-auth about it on every preview request. */
export const previewSessions = pgTable(
  "preview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "preview_sessions_hash_format",
      sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    index("preview_sessions_user").on(t.userId),
    index("preview_sessions_expires").on(t.expiresAt),
  ],
);
