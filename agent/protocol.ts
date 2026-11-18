/**
 * kit-agent's wire protocol: one JSON request per line over the unix socket, one JSON response
 * line back, then the agent closes the connection. The list of operations is closed — anything
 * not in `Request` is rejected before it reaches Docker or Caddy (D011).
 *
 * zod checks the shape (strict: unknown keys are refused); `lib/core` checks the values again
 * when it renders, so a value that slips past one layer still stops at the other.
 */
import { z } from "zod";
import { ENV_NAME_RE, ENVIRONMENTS } from "../lib/core/env";

export const AGENT_VERSION = "0.1.0";

/** Bigger than any legitimate request (a site with a few dozen hosts, an environment's sealed
 * variables); stops a client from making the root process buffer without limit. */
export const MAX_REQUEST_BYTES = 1024 * 1024;

const project = z.string().regex(/^[a-z0-9][a-z0-9_]{0,39}$/);
const sha = z.string().regex(/^[0-9a-f]{7,40}$/);
const port = z.number().int().min(20000).max(29999);

/** `<project>-prod-<sha>` / `<project>-pr-<n>-<sha>`, plus `-g<n>` for a redeploy, as `lib/core`
 * names them. Only these can be stopped or removed — plus the label check against Docker itself. */
export const containerNameSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_]{0,39}-(?:prod|pr-[1-9][0-9]{0,5})-[0-9a-f]{7,12}(?:-g[2-9]|-g[1-9][0-9]{1,3})?$/,
  );
const generation = z.number().int().min(1).max(9999);

const pr = z.number().int().min(1).max(999_999);
const productionTarget = z.strictObject({
  project,
  env: z.literal("production"),
});
const target = z.discriminatedUnion("env", [
  productionTarget,
  z.strictObject({ project, env: z.literal("preview"), pr }),
]);

/** A preview's file: the agent renders it from these values alone (`renderPreviewSite`); the
 * host, the path and the handle are never the caller's. Running proxies to a port; asleep
 * (D017) has none to give. */
const previewSite = z.discriminatedUnion("state", [
  z.strictObject({ project, pr, state: z.literal("running"), port }),
  z.strictObject({ project, pr, state: z.literal("asleep") }),
]);

/** Only GHCR (brief: build → GHCR → POST deploy): dockerd never talks to a registry a client picks. */
const image = z.string().min(1).max(255).startsWith("ghcr.io/");
/** The platform's own hosts are not a project's to take: `db.fockus.dev` keeps its certbot flow. */
export const RESERVED_HOSTS = ["db.fockus.dev", "deploy.fockus.dev"] as const;
const host = z
  .string()
  .min(1)
  .max(253)
  .refine(
    (h) => !(RESERVED_HOSTS as readonly string[]).includes(h.toLowerCase()),
    {
      message: "host is reserved for the platform",
    },
  )
  .refine((h) => !/(^|\.)preview\.fockus\.dev$/i.test(h), {
    // A site block of its own would answer outside the wildcard and its login gate (D013).
    message: "preview hosts are served only through preview.write",
  });
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// ── Variables (phase 04). Shapes only: lib/core/env and crypto check the values again. ──
const environment = z.enum(ENVIRONMENTS);
const envName = z.string().regex(ENV_NAME_RE);
const b64 = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/);
/** What `env_vars` stores; opaque to the caller, opened only here. */
const sealed = z.strictObject({
  ciphertext: b64(43_692).min(4),
  iv: b64(16),
  tag: b64(24),
  keyVersion: z.number().int().min(1),
});
/** One stored variable as the caller read it from its row: the AAD re-checks every field. */
const storedVar = z.strictObject({
  name: envName,
  secret: z.boolean(),
  sealed,
});
/** An environment's variables in one call; more than any project has. */
export const MAX_VARS = 100;

const op = <N extends string, P extends z.ZodRawShape>(name: N, params: P) =>
  z.strictObject({ id, op: z.literal(name), params: z.strictObject(params) });

export const Request = z.discriminatedUnion("op", [
  op("version", {}),
  op("ports.allocate", { target, sha, generation: generation.optional() }),
  op("image.pull", { image }),
  op("container.run", {
    target,
    sha,
    generation: generation.optional(),
    image,
    port,
    memoryMb: z.number().int(),
    /** The target environment's stored variables; the agent opens them into the env file. */
    vars: z.array(storedVar).max(MAX_VARS).optional(),
  }),
  op("container.stop", {
    name: containerNameSchema,
    timeoutS: z.number().int().min(0).max(120).optional(),
  }),
  op("container.remove", { name: containerNameSchema }),
  op("container.start", { name: containerNameSchema }),
  op("container.list", { project: project.optional() }),
  op("site.write", {
    target: productionTarget,
    hosts: z.array(host).min(1).max(50),
    port,
    /** `www` ↔ apex (D028): each `from` answers with a 308 to `to`, which must be one of `hosts`
     * (renderSite checks it). */
    redirects: z
      .array(z.strictObject({ from: host, to: host }))
      .max(50)
      .optional(),
  }),
  op("site.remove", { target: productionTarget }),
  z.strictObject({ id, op: z.literal("preview.write"), params: previewSite }),
  op("preview.remove", { project, pr }),
  op("preview.list", {}),
  op("env.seal", {
    project,
    environment,
    name: envName,
    secret: z.boolean(),
    // Bytes are checked by assertEnvValue; this only bounds the characters.
    value: z
      .string()
      .min(1)
      .max(32 * 1024),
  }),
  /** A build's public variables and its Server Actions key (U7); vars may be empty. */
  op("env.build", {
    project,
    environment: z.enum(["production", "preview"]),
    vars: z.array(storedVar).max(MAX_VARS),
  }),
  op("env.reveal", {
    project,
    environment,
    vars: z.array(storedVar).min(1).max(MAX_VARS),
  }),
  /** `<project>` and `<project>_preview` with kit-db; the URLs never come back. */
  op("db.create", { project }),
  op("health.check", {
    port,
    path: z
      .string()
      .regex(/^\/[A-Za-z0-9._~/-]{0,200}$/)
      .optional(),
  }),
  /** Runtime logs (D014): a project's last lines; `env` is `production` or `pr-<n>`. */
  op("logs.tail", {
    project,
    env: z
      .string()
      .regex(/^(?:production|pr-[1-9][0-9]{0,5})$/)
      .optional(),
    level: z.enum(["error", "warn", "info"]).optional(),
    lines: z.number().int().min(1).max(500).optional(),
  }),
  /** One day of the last 14; `query` is a literal substring (never a pattern), no control chars. */
  op("logs.search", {
    project,
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    query: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\p{Cc}]+$/u)
      .optional(),
    env: z
      .string()
      .regex(/^(?:production|pr-[1-9][0-9]{0,5})$/)
      .optional(),
    level: z.enum(["error", "warn", "info"]).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
    before: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  }),
  /** The certificate Caddy stores for a host (D029): expiry and issuer, or null. */
  op("cert.status", { host }),
  /** D015: one reading of containers, the VPS and Caddy's access log (agent/metrics.ts). */
  op("metrics.sample", {}),
  /** D035: size and last backup of `<project>` and `<project>_preview` (agent/databases.ts). */
  op("db.status", { project }),
  /** Phase 06: the database's, the dashboard's and the previews' certificates (agent/domains.ts). */
  op("platform.certs", {}),
  /** Phase 06: kit-db's last dump per database and its FAIL lines (agent/databases.ts). */
  op("backups.status", {}),
  /** Phase 06 (brief F12): GET a production route with `Authorization: Bearer <CRON_SECRET>`,
   * opened here from its stored row; only the status and duration come back. */
  op("cron.call", {
    project,
    port,
    path: z.string().regex(/^\/(?!.*\.\.)[A-Za-z0-9._~/-]{0,200}$/),
    secret: storedVar,
  }),
]);

export type Request = z.infer<typeof Request>;
export type OpName = Request["op"];

export type ErrorCode =
  | "bad_request"
  /** Valid, but the agent never does it (a Production/Preview secret asked for its value). */
  | "forbidden"
  | "not_managed"
  | "command_failed"
  | "invalid_config"
  | "internal";

export type Response =
  | { id: string | null; ok: true; result: unknown }
  | {
      id: string | null;
      ok: false;
      error: { code: ErrorCode; message: string };
    };
