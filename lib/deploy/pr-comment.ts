/**
 * The PR's comment with its preview (brief, phase 03: "the PR gets its URL"). One comment per
 * project and PR, found by a hidden marker at the top of its body and edited in place on every
 * push, so the PR never fills up with one comment per commit:
 *
 *   GET   /repos/{o}/{r}/issues/{pr}/comments   → the first one that starts with the marker
 *   PATCH /repos/{o}/{r}/issues/comments/{id}    → if there is one
 *   POST  /repos/{o}/{r}/issues/{pr}/comments    → if not (and the caller wants one created)
 *
 * The same token as the statuses (it has "Pull requests: read and write" since 2026-11-13). Only a
 * comment by someone with write access to the repo counts as ours: a stranger who pastes the
 * marker in a comment never gets it overwritten. Errors carry the HTTP status, never a body.
 */

import { previewHost } from "@/lib/core";
import {
  assertRepo,
  discard,
  GitHubError,
  type GitHubOptions,
  type GitHubRequest,
  githubRequest,
  githubTokenFromEnv,
} from "./github";

/** 100 per page × 10: far more comments than a PR of ours ever has; the scan stops there. */
const PER_PAGE = 100;
const MAX_PAGES = 10;
/** GitHub's `author_association` of people who can push: the token's owner is one of them. */
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export type CommentUpsert = {
  /** GitHub `owner/name`. */
  repo: string;
  pr: number;
  /** The hidden marker the body starts with (`previewMarker`). */
  marker: string;
  body: string;
  /** false: only edit an existing comment (closing a PR never creates one). */
  create: boolean;
};

export type CommentResult = "created" | "updated" | "missing";
export type PreviewCommenter = (c: CommentUpsert) => Promise<CommentResult>;

/** `<!-- kit-deploy:preview kd_hello -->`: per project, since two projects may share a repo. */
export function previewMarker(project: string): string {
  if (!/^[a-z0-9_-]+$/.test(project)) throw new GitHubError("bad project");
  return `<!-- kit-deploy:preview ${project} -->`;
}

function assertPr(pr: number) {
  if (!Number.isInteger(pr) || pr < 1 || pr > 999_999)
    throw new GitHubError("bad pr");
}

/** The comment while the preview is up: its URL, the short commit and that it asks for login. */
export function liveCommentBody(p: {
  project: string;
  pr: number;
  sha: string;
}): string {
  if (!/^[0-9a-f]{40}$/.test(p.sha)) throw new GitHubError("bad sha");
  const url = `https://${previewHost(p.project, p.pr)}`;
  return [
    previewMarker(p.project),
    `**Preview de ${p.project}** lista para el PR #${p.pr}.`,
    "",
    `- URL: ${url}`,
    `- Commit: \`${p.sha.slice(0, 7)}\``,
    "",
    "Pide iniciar sesión en kit-deploy. Este comentario se actualiza con cada push.",
  ].join("\n");
}

/** The comment while the preview sleeps (D017): stopped to make room, its next push wakes it. */
export function asleepCommentBody(p: { project: string; pr: number }): string {
  assertPr(p.pr);
  const url = `https://${previewHost(p.project, p.pr)}`;
  return [
    previewMarker(p.project),
    `**Preview de ${p.project}** dormida: se detuvo para dejar sitio a previews más recientes (solo cuatro encendidas a la vez).`,
    "",
    `- URL: ${url}`,
    "",
    `Se despierta sola con el próximo push al PR #${p.pr}.`,
  ].join("\n");
}

/** The comment after the PR was closed: the preview and its containers are gone. */
export function closedCommentBody(p: { project: string; pr: number }): string {
  return [
    previewMarker(p.project),
    `**Preview de ${p.project}** eliminada: el PR #${p.pr} se cerró y su contenedor ya no existe.`,
  ].join("\n");
}

type Comment = { id: number; body: string; author_association: string };

function isComment(x: unknown): x is Comment {
  const c = x as Partial<Comment> | null;
  return (
    typeof c === "object" &&
    c !== null &&
    Number.isSafeInteger(c.id) &&
    typeof c.body === "string" &&
    typeof c.author_association === "string"
  );
}

async function findOurs(
  request: GitHubRequest,
  repo: string,
  pr: number,
  marker: string,
): Promise<number | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await request(
      "GET",
      `/repos/${repo}/issues/${pr}/comments?per_page=${PER_PAGE}&page=${page}`,
      [200],
    );
    let list: unknown;
    try {
      list = await res.json();
    } catch {
      throw new GitHubError("github sent an unreadable comment list");
    }
    if (!Array.isArray(list))
      throw new GitHubError("github sent an unreadable comment list");
    const ours = list.find(
      (c) =>
        isComment(c) &&
        TRUSTED.has(c.author_association) &&
        c.body.startsWith(marker),
    ) as Comment | undefined;
    if (ours) return ours.id;
    if (list.length < PER_PAGE) return null;
  }
  return null;
}

export function githubCommenter(
  token: string,
  opts: GitHubOptions = {},
): PreviewCommenter {
  const request = githubRequest(token, opts);
  return async (c) => {
    const repo = assertRepo(c.repo);
    assertPr(c.pr);
    if (!c.body.startsWith(c.marker))
      throw new GitHubError("body must start with its marker");
    const id = await findOurs(request, repo, c.pr, c.marker);
    if (id !== null) {
      await discard(
        await request("PATCH", `/repos/${repo}/issues/comments/${id}`, [200], {
          body: c.body,
        }),
      );
      return "updated";
    }
    if (!c.create) return "missing";
    await discard(
      await request("POST", `/repos/${repo}/issues/${c.pr}/comments`, [201], {
        body: c.body,
      }),
    );
    return "created";
  };
}

/** The commenter from the environment, or null when the platform has no token (comments off). */
export function commenterFromEnv(
  env: Record<string, string | undefined> = process.env,
): PreviewCommenter | null {
  const token = githubTokenFromEnv(env);
  return token ? githubCommenter(token) : null;
}
