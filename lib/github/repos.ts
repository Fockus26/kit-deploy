/**
 * César's GitHub repos for Nuevo proyecto's picker (D061), with the read-only token
 * (`GITHUB_READ_TOKEN`, from `/etc/kit-deploy/github-read.env`). Same rules as
 * lib/deploy/github.ts: the token only goes in the Authorization header, and a failure is only
 * its HTTP status. It never throws and never logs; only the `Repo` fields leave here.
 */

import {
  GITHUB_API,
  GitHubError,
  type GitHubOptions,
  githubRequest,
  isRepo,
} from "@/lib/deploy/github";
import type { Repo, RepoList } from "@/lib/github/repo-filter";

export const REPOS_PER_PAGE = 100;
export const REPOS_MAX_PAGES = 5;
export const REPOS_CACHE_MS = 5 * 60_000;

const FIRST_PAGE = `/user/repos?per_page=${REPOS_PER_PAGE}&sort=pushed&affiliation=owner,collaborator,organization_member`;

/** The read-only token from the environment, or null (the field stays a plain input). */
export function githubReadTokenFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.GITHUB_READ_TOKEN || null;
}

// One list per process: the panel has one user. A failure is never kept.
let cache: { token: string; at: number; list: RepoList } | null = null;

/** Tests only: forget the cached list. */
export function resetRepoCache(): void {
  cache = null;
}

export type ListReposOptions = GitHubOptions & { now?: () => number };

export async function listRepos(
  token: string | null,
  opts: ListReposOptions = {},
): Promise<RepoList> {
  if (!token) return { kind: "no-token" };
  const now = opts.now ?? Date.now;
  if (cache && cache.token === token && now() - cache.at < REPOS_CACHE_MS)
    return cache.list;

  const api = opts.api ?? GITHUB_API;
  const request = githubRequest(token, { timeoutMs: 5_000, ...opts });
  const repos: Repo[] = [];
  let path: string | null = FIRST_PAGE;
  let pages = 0;
  try {
    while (path && pages < REPOS_MAX_PAGES) {
      const res = await request("GET", path, [200]);
      pages++;
      const body: unknown = await res.json().catch(() => null);
      if (!Array.isArray(body)) return { kind: "error", status: res.status };
      for (const item of body) {
        const repo = toRepo(item);
        if (repo) repos.push(repo);
      }
      path = nextPath(res.headers.get("link"), api);
    }
  } catch (e) {
    return {
      kind: "error",
      status: e instanceof GitHubError ? (e.status ?? null) : null,
    };
  }
  const list: RepoList = { kind: "ok", repos, truncated: path !== null };
  cache = { token, at: now(), list };
  return list;
}

/** Only the fields the picker uses, and only a repo the platform accepts as `owner/name`. */
function toRepo(item: unknown): Repo | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  if (typeof r.full_name !== "string" || !isRepo(r.full_name)) return null;
  return {
    fullName: r.full_name,
    private: r.private === true,
    pushedAt: typeof r.pushed_at === "string" ? r.pushed_at : null,
    defaultBranch:
      typeof r.default_branch === "string" && r.default_branch
        ? r.default_branch
        : "main",
  };
}

/**
 * The `rel="next"` page from GitHub's Link header, as a path on the same API. A link to any
 * other host is ignored: the token must never follow it there.
 */
export function nextPath(link: string | null, api = GITHUB_API): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /^\s*<([^>]+)>\s*;\s*rel="next"\s*$/.exec(part);
    if (!m) continue;
    const url = m[1];
    return url.startsWith(`${api}/`) ? url.slice(api.length) : null;
  }
  return null;
}
