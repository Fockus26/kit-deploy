/**
 * kit-agent's wire protocol: one JSON request per line over the unix socket, one JSON response
 * line back, then the agent closes the connection. The list of operations is closed — anything
 * not in `Request` is rejected before it reaches Docker or Caddy (D011).
 *
 * zod checks the shape (strict: unknown keys are refused); `lib/core` checks the values again
 * when it renders, so a value that slips past one layer still stops at the other.
 */
import { z } from "zod";

export const AGENT_VERSION = "0.1.0";

/** Bigger than any legitimate request (a site with a few dozen hosts); stops a client from
 * making the root process buffer without limit. */
export const MAX_REQUEST_BYTES = 64 * 1024;

const project = z.string().regex(/^[a-z0-9][a-z0-9_]{0,39}$/);
const sha = z.string().regex(/^[0-9a-f]{7,40}$/);
const port = z.number().int().min(20000).max(29999);

/** `<project>-prod-<sha>` / `<project>-pr-<n>-<sha>`, as `lib/core` names them. Only these
 * can be stopped or removed — plus the label check against Docker itself. */
export const containerNameSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9_]{0,39}-(?:prod|pr-[1-9][0-9]{0,5})-[0-9a-f]{7,12}$/,
  );

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

const op = <N extends string, P extends z.ZodRawShape>(name: N, params: P) =>
  z.strictObject({ id, op: z.literal(name), params: z.strictObject(params) });

export const Request = z.discriminatedUnion("op", [
  op("version", {}),
  op("ports.allocate", { target, sha }),
  op("image.pull", { image }),
  op("container.run", {
    target,
    sha,
    image,
    port,
    memoryMb: z.number().int(),
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
  }),
  op("site.remove", { target: productionTarget }),
  z.strictObject({ id, op: z.literal("preview.write"), params: previewSite }),
  op("preview.remove", { project, pr }),
  op("health.check", {
    port,
    path: z
      .string()
      .regex(/^\/[A-Za-z0-9._~/-]{0,200}$/)
      .optional(),
  }),
]);

export type Request = z.infer<typeof Request>;
export type OpName = Request["op"];

export type ErrorCode =
  | "bad_request"
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
