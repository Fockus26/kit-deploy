/**
 * The one way the platform talks to GitHub's REST API: the commit statuses and the PR comment.
 * The token (`GITHUB_STATUS_TOKEN`, from `/etc/kit-deploy/github.env`) only goes in the
 * Authorization header. An error says the HTTP status or the fetch error's name, never the
 * response body nor anything that could carry the token.
 */

export const GITHUB_API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubError";
  }
}

export type GitHubOptions = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  api?: string;
};

/** Sends one request; `expect` are the statuses that count as success. Returns the response
 * with its body unread (the caller reads it or cancels it). */
export type GitHubRequest = (
  method: "GET" | "POST" | "PATCH",
  path: string,
  expect: number[],
  body?: unknown,
) => Promise<Response>;

export function githubRequest(
  token: string,
  opts: GitHubOptions = {},
): GitHubRequest {
  const doFetch = opts.fetch ?? fetch;
  const api = opts.api ?? GITHUB_API;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return async (method, path, expect, body) => {
    let res: Response;
    try {
      res = await doFetch(`${api}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "kit-deploy",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new GitHubError(`github unreachable: ${(e as Error).name}`);
    }
    if (!expect.includes(res.status)) {
      // The body is not read into the error: only the status code leaves here.
      await discard(res);
      throw new GitHubError(`github answered ${res.status}`);
    }
    return res;
  };
}

export async function discard(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => undefined);
}

// The same rule as `projects_repo_format` in the schema.
const REPO =
  /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;

/** A GitHub `owner/name` checked before it goes into a URL path. */
export function assertRepo(repo: string): string {
  if (!REPO.test(repo)) throw new GitHubError(`bad repo "${repo}"`);
  return repo;
}

/** The platform's token from the environment, or null (GitHub integration off). */
export function githubTokenFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.GITHUB_STATUS_TOKEN || null;
}
