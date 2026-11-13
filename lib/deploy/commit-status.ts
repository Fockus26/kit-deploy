/**
 * The commit's status on GitHub after the switch (brief, phase 02: "the commit gets its status").
 * `POST /repos/{owner}/{repo}/statuses/{sha}` with the platform's own token (fine-grained, only
 * "Commit statuses: read and write" on the projects' repos), from `/etc/kit-deploy/github.env`
 * (root 0600, written by `infra/install.sh --github-token`). The token is never logged or
 * returned; an error says only the HTTP status.
 */

export const STATUS_CONTEXT = "kit-deploy/production";
/** GitHub's limit for `description`. */
export const DESCRIPTION_MAX = 140;

export type CommitStatus = {
  /** GitHub `owner/name`. */
  repo: string;
  sha: string;
  state: "success" | "failure";
  description: string;
  /** https only; the site's URL on success. */
  targetUrl?: string;
};

export type StatusPublisher = (s: CommitStatus) => Promise<void>;

// The same rule as `projects_repo_format` in the schema.
const REPO =
  /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;
const SHA = /^[0-9a-f]{40}$/;

export class StatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatusError";
  }
}

/** The request body GitHub gets; validated, so nothing odd ends up in the URL or the payload. */
export function statusRequest(s: CommitStatus): { path: string; body: string } {
  if (!REPO.test(s.repo)) throw new StatusError(`bad repo "${s.repo}"`);
  if (!SHA.test(s.sha)) throw new StatusError("bad sha");
  if (s.targetUrl !== undefined && !/^https:\/\/[^\s]+$/.test(s.targetUrl))
    throw new StatusError("target_url must be https");
  const description =
    s.description.length > DESCRIPTION_MAX
      ? `${s.description.slice(0, DESCRIPTION_MAX - 1)}…`
      : s.description;
  return {
    path: `/repos/${s.repo}/statuses/${s.sha}`,
    body: JSON.stringify({
      state: s.state,
      context: STATUS_CONTEXT,
      description,
      ...(s.targetUrl ? { target_url: s.targetUrl } : {}),
    }),
  };
}

export function githubStatusPublisher(
  token: string,
  opts: { fetch?: typeof fetch; timeoutMs?: number; api?: string } = {},
): StatusPublisher {
  const doFetch = opts.fetch ?? fetch;
  const api = opts.api ?? "https://api.github.com";
  const timeoutMs = opts.timeoutMs ?? 10_000;
  return async (s) => {
    const { path, body } = statusRequest(s);
    let res: Response;
    try {
      res = await doFetch(`${api}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "kit-deploy",
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new StatusError(`github unreachable: ${(e as Error).name}`);
    }
    // 201 Created. The body is not read into the error: only the status code leaves here.
    if (res.status !== 201) {
      await res.body?.cancel().catch(() => undefined);
      throw new StatusError(`github answered ${res.status}`);
    }
    await res.body?.cancel().catch(() => undefined);
  };
}

/** The publisher from the environment, or null when the platform has no token (statuses off). */
export function statusPublisherFromEnv(
  env: Record<string, string | undefined> = process.env,
): StatusPublisher | null {
  const token = env.GITHUB_STATUS_TOKEN;
  return token ? githubStatusPublisher(token) : null;
}
