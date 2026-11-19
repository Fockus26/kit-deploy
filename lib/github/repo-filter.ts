/**
 * The repo picker's pure part, shared by the server (what the page passes) and the combobox
 * (what it shows). Nothing here talks to GitHub.
 */

import { isRepo } from "@/lib/github/repo-name";

/** The only fields of a GitHub repo that ever leave the server. */
export type Repo = {
  fullName: string;
  private: boolean;
  pushedAt: string | null;
  defaultBranch: string;
};

/** What the Nuevo proyecto page gets: the list, or why there is none. */
export type RepoList =
  | { kind: "ok"; repos: Repo[]; truncated: boolean }
  | { kind: "no-token" }
  | { kind: "error"; status: number | null };

/** The repos whose `owner/name` contains the query (case-insensitive), in their order. */
export function filterRepos(repos: readonly Repo[], query: string): Repo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...repos];
  return repos.filter((r) => r.fullName.toLowerCase().includes(q));
}

/**
 * The typed text, when it is a valid `owner/repo` that is not already in the list (any case):
 * the picker then offers "Usar «owner/repo»". Null otherwise.
 */
export function freeTextRepo(
  repos: readonly Repo[],
  query: string,
): string | null {
  const q = query.trim();
  if (!isRepo(q)) return null;
  const lower = q.toLowerCase();
  return repos.some((r) => r.fullName.toLowerCase() === lower) ? null : q;
}

/** "Rama de producción" before anything is picked, and for a repo whose default is unknown. */
export const DEFAULT_BRANCH = "main";

/**
 * "Rama" after a pick: a branch the user typed is kept; otherwise it follows the pick — the
 * listed repo's default branch, or `main` for a typed repo ("Usar «…»"), never the branch of a
 * repo picked before.
 */
export function branchAfterPick(
  current: string,
  repo: Repo | null,
  branchEdited: boolean,
): string {
  if (branchEdited) return current;
  return repo ? repo.defaultBranch : DEFAULT_BRANCH;
}
