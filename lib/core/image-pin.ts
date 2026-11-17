/**
 * Which image may receive a project's variables (phase 04 U4, security review). The database is
 * writable by the web app, so the project → repository mapping the agent trusts lives in a
 * root-owned file instead: `/etc/kit-deploy/images/<project>`, holding `ghcr.io/<owner>/<repo>`.
 * Only root writes it (`kit-deploy project add|pin`, over `ssh kit-vps`), and its repository
 * always comes from what César typed, never from the database.
 */
import { assertProject, CoreInputError } from "./validate";

export const IMAGE_PINS_DIR = "/etc/kit-deploy/images";

/** GitHub's `owner/name` as the projects table checks it. */
const REPO =
  /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;

export function pinPath(project: string): string {
  return `${IMAGE_PINS_DIR}/${assertProject(project)}`;
}

/** The file's content for a repository: `ghcr.io/<owner>/<repo>` in lower case, as `imageFor`. */
export function pinFor(repo: string): string {
  if (!REPO.test(repo)) {
    throw new CoreInputError(`invalid repo "${repo}": expected owner/name`);
  }
  return `ghcr.io/${repo.toLowerCase()}`;
}

/** The pin from its file's text; null when it is not one. */
export function parsePin(text: string | null): string | null {
  if (text === null) return null;
  const pin = text.trim();
  return /^ghcr\.io\/[a-z0-9_-][a-z0-9_.-]{0,99}\/[a-z0-9_-][a-z0-9_.-]{0,99}$/.test(
    pin,
  )
    ? pin
    : null;
}

/** `<pin>:<tag>` or `<pin>@sha256:…` (or both): exactly that repository, no deeper path. */
export function imageMatchesPin(image: string, pin: string): boolean {
  if (!image.startsWith(pin)) return false;
  const rest = image.slice(pin.length);
  return (
    /^(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[0-9a-f]{64})?$/.test(
      rest,
    ) && rest !== ""
  );
}
