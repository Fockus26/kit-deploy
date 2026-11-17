import {
  PREVIEW_DOMAIN,
  PROJECT_DOMAIN,
  RESERVED_SUBDOMAINS,
} from "./constants";
import { assertIntInRange, assertProject, assertSha } from "./validate";

/** What a deployment serves: a project's production, or one of its PR previews. */
export type Target =
  | { project: string; env: "production" }
  | { project: string; env: "preview"; pr: number };

export type ProductionTarget = Extract<Target, { env: "production" }>;

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

/** A redeploy of the same commit (phase 04 U8): 1 is the first deployment of a commit. */
export const MAX_GENERATION = 9999;

/** `<project>-prod-<sha12>` / `<project>-pr-<n>-<sha12>` (brief, Architecture), plus `-g<n>` for
 * a redeploy of the same commit. Unique per commit and generation, so the new container can start
 * beside the old one during the switch — also when only its variables changed. */
export function containerName(
  target: Target,
  sha: string,
  generation = 1,
): string {
  checkTarget(target);
  const short = assertSha(sha).slice(0, 12);
  assertIntInRange("generation", generation, 1, MAX_GENERATION);
  const base =
    target.env === "production"
      ? `${target.project}-prod-${short}`
      : `${target.project}-pr-${target.pr}-${short}`;
  return generation === 1 ? base : `${base}-g${generation}`;
}

/** D001: `<project>-pr-<n>.preview.fockus.dev`. Underscores are not valid in a hostname, so the
 * kit-db name's `_` becomes `-`. */
export function previewHost(project: string, pr: number): string {
  siteName({ project, env: "preview", pr });
  return `${project.replace(/_/g, "-")}-pr-${pr}.${PREVIEW_DOMAIN}`;
}

/** `<project>.fockus.dev`, with the kit-db name's `_` as `-`. Null for a reserved subdomain. */
export function defaultHost(project: string): string | null {
  assertProject(project);
  const label = project.replace(/_/g, "-");
  if (/^-|-$/.test(label)) return null;
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(label)
    ? null
    : `${label}.${PROJECT_DOMAIN}`;
}
