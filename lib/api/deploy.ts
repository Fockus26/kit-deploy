/**
 * The deploy API, called by a project's `deploy-vps.yml` with the project's token:
 *
 *   Authorization: Bearer <KIT_DEPLOY_TOKEN>      the project's token (hashed in deploy_tokens)
 *
 *   POST   /api/v1/deploy   { "sha": "<40-hex>" }                 production (after a push to main)
 *   POST   /api/v1/deploy   { "sha": "<40-hex>", "pr": <n> }      the preview of PR n
 *   DELETE /api/v1/preview  { "pr": <n> }                         PR n was closed: its preview goes
 *
 * A deploy records a queued deployment and the switch (`lib/deploy/switch.ts`) starts it after
 * the response. The token decides the project and the image is derived from the project's repo:
 * a caller can never choose which image runs, only which commit of its own repo — nor touch
 * another project's previews.
 */
import { z } from "zod";
import { previewHost } from "@/lib/core";
import { assertImage } from "@/lib/core/validate";
import type { DeployStore, TokenProject } from "@/lib/db/store";
import { bearerToken, hashToken } from "@/lib/tokens";

export const MAX_BODY_BYTES = 4096;

/** A PR number, as GitHub and `lib/core` (`siteName`) allow it. */
const pr = z.number().int().min(1).max(999_999);
const DeployBody = z.strictObject({
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  pr: pr.optional(),
});
const CloseBody = z.strictObject({ pr });

export const json = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });

const unauthorized = () =>
  json(
    401,
    { error: "unauthorized" },
    { "www-authenticate": 'Bearer realm="kit-deploy"' },
  );

export function imageFor(repo: string, sha: string): string {
  return assertImage(`ghcr.io/${repo.toLowerCase()}:${sha}`);
}

export type DeployHooks = {
  /** A deployment of this project is queued: start the switch (after the response). */
  onQueued?: (projectId: string) => void;
};

export type PreviewHooks = {
  /** PR `pr` of this project was closed: remove its preview (after the response). */
  onClosed?: (project: TokenProject["project"], pr: number) => void;
};

type Authorized<T> =
  | { ok: true; body: T; found: TokenProject }
  | { ok: false; response: Response };

/**
 * The same gate for every route: a well-formed bearer token, a bounded JSON body that matches
 * `schema`, then the token's project. The body is checked before the database is asked, so a
 * malformed request never costs a query; the token is never logged.
 */
export async function authorize<T>(
  request: Request,
  store: DeployStore,
  schema: z.ZodType<T>,
  expected: string,
): Promise<Authorized<T>> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return { ok: false, response: unauthorized() };

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES)
    return { ok: false, response: json(413, { error: "body too large" }) };
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES)
    return { ok: false, response: json(413, { error: "body too large" }) };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: json(400, { error: "body is not valid JSON" }),
    };
  }
  const body = schema.safeParse(raw);
  if (!body.success)
    return {
      ok: false,
      response: json(400, { error: `expected ${expected}` }),
    };

  const found = await store.findTokenProject(hashToken(token));
  if (!found) return { ok: false, response: unauthorized() };
  await store.touchToken(found.tokenId);
  return { ok: true, body: body.data, found };
}

const internalError = (where: string, e: unknown) => {
  // The token never reaches the log: only the error.
  console.error(`${where}:`, e instanceof Error ? e.message : e);
  return json(500, { error: "internal error" });
};

/** Where a preview answers, for the Action's output (and the PR comment, U7). */
function previewOf(project: string, n: number) {
  return { pr: n, url: `https://${previewHost(project, n)}` };
}

export async function handleDeploy(
  request: Request,
  store: DeployStore,
  hooks: DeployHooks = {},
): Promise<Response> {
  try {
    const auth = await authorize(
      request,
      store,
      DeployBody,
      "{ sha: <40 hex chars>, pr?: <PR number> }",
    );
    if (!auth.ok) return auth.response;
    const { sha, pr: n } = auth.body;
    const { project } = auth.found;
    const scope = { pr: n ?? null };
    const extra =
      n === undefined ? {} : { preview: previewOf(project.name, n) };

    const existing = await store.findOpenDeployment(project.id, scope, sha);
    if (existing) {
      // A retry of a commit still queued (the web restarted mid-way?) kicks the switch again.
      if (existing.status === "queued") hooks.onQueued?.(project.id);
      return json(200, { deployment: existing, ...extra });
    }

    const image = imageFor(project.repo, sha);
    const deployment = await store.createDeployment(
      n === undefined
        ? { projectId: project.id, environment: "production", sha, image }
        : { projectId: project.id, environment: "preview", pr: n, sha, image },
    );
    if (deployment) {
      hooks.onQueued?.(project.id);
      return json(202, { deployment, ...extra });
    }
    // A concurrent retry of the same commit created it between our lookup and our insert.
    const twin = await store.findOpenDeployment(project.id, scope, sha);
    if (!twin) throw new Error("open deployment vanished after a conflict");
    return json(200, { deployment: twin, ...extra });
  } catch (e) {
    return internalError("deploy api", e);
  }
}

/** `DELETE /api/v1/preview`: the PR was closed (merged or not). Idempotent: a PR without a
 * preview, or one already gone, gets the same 202 — the Action of a closed PR never fails. */
export async function handleClosePreview(
  request: Request,
  store: DeployStore,
  hooks: PreviewHooks = {},
): Promise<Response> {
  try {
    const auth = await authorize(
      request,
      store,
      CloseBody,
      "{ pr: <PR number> }",
    );
    if (!auth.ok) return auth.response;
    const { project } = auth.found;
    hooks.onClosed?.(project, auth.body.pr);
    return json(202, { preview: previewOf(project.name, auth.body.pr) });
  } catch (e) {
    return internalError("preview api", e);
  }
}
