/**
 * `POST /api/v1/deploy` — called by a project's `deploy-vps.yml` after it pushed the image to
 * GHCR. It records a queued production deployment; the switch (next unit) starts it.
 *
 *   Authorization: Bearer <KIT_DEPLOY_TOKEN>      the project's token (hashed in deploy_tokens)
 *   { "sha": "<40-hex commit>" }
 *
 * The token decides the project and the image is derived from the project's repo: a caller can
 * never choose which image runs, only which commit of its own repo.
 */
import { z } from "zod";
import { assertImage } from "@/lib/core/validate";
import type { DeployStore } from "@/lib/db/store";
import { bearerToken, hashToken } from "@/lib/tokens";

export const MAX_BODY_BYTES = 4096;

const Body = z.strictObject({ sha: z.string().regex(/^[0-9a-f]{40}$/) });

const json = (
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

export async function handleDeploy(
  request: Request,
  store: DeployStore,
  hooks: DeployHooks = {},
): Promise<Response> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized();

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json(413, { error: "body too large" });
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES)
    return json(413, { error: "body too large" });

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: "body is not valid JSON" });
  }
  const body = Body.safeParse(raw);
  if (!body.success)
    return json(400, { error: "expected { sha: <40 hex chars> }" });
  const { sha } = body.data;

  try {
    const found = await store.findTokenProject(hashToken(token));
    if (!found) return unauthorized();
    await store.touchToken(found.tokenId);

    const existing = await store.findOpenDeployment(found.project.id, sha);
    if (existing) {
      // A retry of a commit still queued (the web restarted mid-way?) kicks the switch again.
      if (existing.status === "queued") hooks.onQueued?.(found.project.id);
      return json(200, { deployment: existing });
    }

    const deployment = await store.createDeployment({
      projectId: found.project.id,
      environment: "production",
      sha,
      image: imageFor(found.project.repo, sha),
    });
    if (deployment) {
      hooks.onQueued?.(found.project.id);
      return json(202, { deployment });
    }
    // A concurrent retry of the same commit created it between our lookup and our insert.
    const twin = await store.findOpenDeployment(found.project.id, sha);
    if (!twin) throw new Error("open deployment vanished after a conflict");
    return json(200, { deployment: twin });
  } catch (e) {
    // The token never reaches the log: only the error.
    console.error("deploy api:", e instanceof Error ? e.message : e);
    return json(500, { error: "internal error" });
  }
}
