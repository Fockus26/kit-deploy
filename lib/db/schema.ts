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
import { ENVIRONMENTS, MANAGED_NAMES, RESERVED_NAMES } from "../core/env";

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
  /** A preview stopped to make room (D017): its container is gone, its host serves "dormido",
   * and its next push wakes it. Not open: a push of the same commit deploys it again. */
  "asleep",
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
    /** 1 for a commit's first deployment; a redeploy of the same commit (new variables, same
     * image: phase 04 U8) takes the next one, and its container is `…-g<n>`. */
    generation: integer("generation").notNull().default(1),
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
    // One open deployment per commit, generation and target (production, or one PR): two
    // concurrent retries of the Action cannot queue twice, while a redeploy (the next generation)
    // can queue beside the live one. `coalesce`: production's null PR must collide with itself.
    uniqueIndex("deployments_open_commit")
      .on(
        t.projectId,
        t.environment,
        sql`coalesce(${t.pr}, 0)`,
        t.sha,
        t.generation,
      )
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
    check(
      "deployments_generation_range",
      sql`${t.generation} between 1 and 9999`,
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

// ── Environment variables (brief F4, phase 04) ──────────────────────────────────────────────

/** `ssh:cesar` from the CLI, `web:<user id>` from the dashboard. */
const ACTOR_RE = "^(ssh|web):[A-Za-z0-9_.@-]{1,64}$";

const inList = (col: string, values: readonly string[]) =>
  sql.raw(`${col} in (${values.map((v) => `'${v}'`).join(", ")})`);

/**
 * One variable of one project in one environment. Every value is sealed (AES-256-GCM,
 * lib/core/crypto.ts) by kit-agent, plain or secret: `secret` only decides whether it can ever be
 * read back. The blob's AAD carries project, environment, name and `secret`, so editing any of
 * them here makes it fail to open. Never holds the managed names (DATABASE_URL, …): the agent
 * resolves those at each start.
 */
export const envVars = pgTable(
  "env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment", { enum: ENVIRONMENTS }).notNull(),
    name: text("name").notNull(),
    secret: boolean("secret").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Who set the current value, as in audit_log.actor. */
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    uniqueIndex("env_vars_slot").on(t.projectId, t.environment, t.name),
    check("env_vars_environment", inList("environment", ENVIRONMENTS)),
    check("env_vars_name_format", sql`${t.name} ~ '^[A-Z_][A-Z0-9_]{0,127}$'`),
    check(
      "env_vars_name_settable",
      sql`not ${inList("name", [...RESERVED_NAMES, ...MANAGED_NAMES])}`,
    ),
    check(
      "env_vars_public_not_secret",
      sql`not (${t.secret} and ${t.name} like 'NEXT\\_PUBLIC\\_%')`,
    ),
    // 12-byte IV and 16-byte tag in base64; the ciphertext at most 32 KiB of value.
    check("env_vars_iv_format", sql`${t.iv} ~ '^[A-Za-z0-9+/]{16}$'`),
    check("env_vars_tag_format", sql`${t.tag} ~ '^[A-Za-z0-9+/]{22}==$'`),
    check(
      "env_vars_ciphertext_format",
      sql`${t.ciphertext} ~ '^[A-Za-z0-9+/]+={0,2}$' and length(${t.ciphertext}) <= 43692`,
    ),
    check("env_vars_key_version", sql`${t.keyVersion} >= 1`),
    check(
      "env_vars_updated_by_format",
      sql`${t.updatedBy} ~ ${sql.raw(`'${ACTOR_RE}'`)}`,
    ),
  ],
);

export const AUDIT_ACTIONS = ["env.set", "env.remove"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Who changed what and when (brief F4) — never a value. The project is stored by name, not by
 * reference: the record outlives the project.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** `ssh:cesar` from the CLI, `web:<user id>` from the dashboard. */
    actor: text("actor").notNull(),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    project: text("project").notNull(),
    environment: text("environment", { enum: ENVIRONMENTS }),
    name: text("name"),
  },
  (t) => [
    index("audit_log_project_at").on(t.project, t.at.desc()),
    check("audit_log_action", inList("action", AUDIT_ACTIONS)),
    check(
      "audit_log_environment",
      sql`${t.environment} is null or ${inList("environment", ENVIRONMENTS)}`,
    ),
    check(
      "audit_log_actor_format",
      sql`${t.actor} ~ ${sql.raw(`'${ACTOR_RE}'`)}`,
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
