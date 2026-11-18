/** The shapes the database checks (lib/db/schema.ts), as the CLI and the panel's forms test them.
 * No imports: the panel's browser code uses them too. */

/** `projects_name_format`: the kit-db name, also the container and site prefix. */
export const PROJECT_RE = /^[a-z0-9][a-z0-9_]{0,39}$/;
/** `projects_repo_format`: GitHub `owner/name`, neither part starting with `.`. */
export const REPO_RE =
  /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;
/** What `dispatchRebuild` accepts as a production branch (and never `..`). */
export const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/;
export const DEFAULT_MEMORY_MB = 512;
/** `deploy_tokens.label` is free text; cut here. */
export const TOKEN_LABEL_MAX = 100;
