import { PREVIEW_DOMAIN } from "./constants";
import { assertIntInRange, assertProject, assertSha } from "./validate";

/** What a deployment serves: a project's production, or one of its PR previews. */
export type Target =
  | { project: string; env: "production" }
  | { project: string; env: "preview"; pr: number };

const MAX_PR = 999_999;

function checkTarget(target: Target): void {
  assertProject(target.project);
  if (target.env === "preview")
    assertIntInRange("PR number", target.pr, 1, MAX_PR);
}

/** The site's stable name: its Caddy file is `<siteName>.caddy`. One per production, one per PR. */
export function siteName(target: Target): string {
  checkTarget(target);
  return target.env === "production"
    ? target.project
    : `${target.project}-pr-${target.pr}`;
}

/** `<project>-prod-<sha12>` / `<project>-pr-<n>-<sha12>` (brief, Architecture). Unique per
 * commit, so the new container can start beside the old one during the switch. */
export function containerName(target: Target, sha: string): string {
  checkTarget(target);
  const short = assertSha(sha).slice(0, 12);
  return target.env === "production"
    ? `${target.project}-prod-${short}`
    : `${target.project}-pr-${target.pr}-${short}`;
}

/** D001: `<project>-pr-<n>.preview.fockus.dev`. Underscores are not valid in a hostname, so the
 * kit-db name's `_` becomes `-`. */
export function previewHost(project: string, pr: number): string {
  siteName({ project, env: "preview", pr });
  return `${project.replace(/_/g, "-")}-pr-${pr}.${PREVIEW_DOMAIN}`;
}
