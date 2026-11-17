/**
 * Whether a PR is still open on GitHub, for the nightly sweep (`kit-deploy preview sweep`): a
 * preview whose PR closed while the `DELETE /api/v1/preview` never arrived is cleaned up like a
 * normal close. Read only: `GET /repos/{o}/{r}/pulls/{n}` with the platform's token (it has
 * "Pull requests: read and write" since 2026-11-13). Errors carry the HTTP status, never a body.
 */

import {
  assertRepo,
  discard,
  GitHubError,
  type GitHubOptions,
  githubRequest,
  githubTokenFromEnv,
} from "./github";

/** `missing`: GitHub answered 404 (the repo was renamed or deleted, or the token lost it). */
export type PullState = "open" | "closed" | "missing";
export type PullStateReader = (repo: string, pr: number) => Promise<PullState>;

export function githubPullState(
  token: string,
  opts: GitHubOptions = {},
): PullStateReader {
  const request = githubRequest(token, opts);
  return async (repo, pr) => {
    assertRepo(repo);
    if (!Number.isInteger(pr) || pr < 1 || pr > 999_999)
      throw new GitHubError("bad pr");
    const res = await request("GET", `/repos/${repo}/pulls/${pr}`, [200, 404]);
    if (res.status === 404) {
      await discard(res);
      return "missing";
    }
    let state: unknown;
    try {
      state = ((await res.json()) as { state?: unknown }).state;
    } catch {
      throw new GitHubError("github sent an unreadable pull request");
    }
    if (state === "open" || state === "closed") return state;
    throw new GitHubError("github sent a pull request without a state");
  };
}

/** The reader from the environment, or null when the platform has no token. */
export function pullStateFromEnv(
  env: Record<string, string | undefined> = process.env,
): PullStateReader | null {
  const token = githubTokenFromEnv(env);
  return token ? githubPullState(token) : null;
}
