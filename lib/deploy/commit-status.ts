/**
 * The commit's status on GitHub after the switch (brief, phase 02: "the commit gets its status";
 * phase 03: the preview's). `POST /repos/{owner}/{repo}/statuses/{sha}` with the platform's own
 * token (fine-grained: "Commit statuses" and "Pull requests" read and write on the projects'
 * repos), from `/etc/kit-deploy/github.env` (root 0600, written by `infra/install.sh
 * --github-token`). The token is never logged or returned; an error says only the HTTP status.
 */

import {
  assertRepo,
  discard,
  GitHubError,
  type GitHubOptions,
  githubRequest,
  githubTokenFromEnv,
} from "./github";

export { GitHubError as StatusError } from "./github";

/** One status per environment, so a preview's never overwrites production's on the same sha. */
export const STATUS_CONTEXTS = {
  production: "kit-deploy/production",
  preview: "kit-deploy/preview",
} as const;
export type StatusContext =
  (typeof STATUS_CONTEXTS)[keyof typeof STATUS_CONTEXTS];
/** GitHub's limit for `description`. */
export const DESCRIPTION_MAX = 140;

export type CommitStatus = {
  /** GitHub `owner/name`. */
  repo: string;
  sha: string;
  context: StatusContext;
  state: "success" | "failure";
  description: string;
  /** https only; the site's or the preview's URL on success. */
  targetUrl?: string;
};

export type StatusPublisher = (s: CommitStatus) => Promise<void>;

const SHA = /^[0-9a-f]{40}$/;
const CONTEXTS: readonly string[] = Object.values(STATUS_CONTEXTS);

/** The request body GitHub gets; validated, so nothing odd ends up in the URL or the payload. */
export function statusRequest(s: CommitStatus): { path: string; body: string } {
  assertRepo(s.repo);
  if (!SHA.test(s.sha)) throw new GitHubError("bad sha");
  if (!CONTEXTS.includes(s.context)) throw new GitHubError("bad context");
  if (s.targetUrl !== undefined && !/^https:\/\/[^\s]+$/.test(s.targetUrl))
    throw new GitHubError("target_url must be https");
  const description =
    s.description.length > DESCRIPTION_MAX
      ? `${s.description.slice(0, DESCRIPTION_MAX - 1)}…`
      : s.description;
  return {
    path: `/repos/${s.repo}/statuses/${s.sha}`,
    body: JSON.stringify({
      state: s.state,
      context: s.context,
      description,
      ...(s.targetUrl ? { target_url: s.targetUrl } : {}),
    }),
  };
}

export function githubStatusPublisher(
  token: string,
  opts: GitHubOptions = {},
): StatusPublisher {
  const request = githubRequest(token, opts);
  return async (s) => {
    const { path, body } = statusRequest(s);
    // 201 Created; nothing in its body is needed.
    await discard(await request("POST", path, [201], JSON.parse(body)));
  };
}

/** The publisher from the environment, or null when the platform has no token (statuses off). */
export function statusPublisherFromEnv(
  env: Record<string, string | undefined> = process.env,
): StatusPublisher | null {
  const token = githubTokenFromEnv(env);
  return token ? githubStatusPublisher(token) : null;
}
