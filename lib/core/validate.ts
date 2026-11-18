/**
 * Input checks shared by the renderers. Everything that ends up in a Caddy site file or in
 * `docker run`'s argv goes through here first: kit-agent runs as root, so a value with a
 * space, a brace, a newline or a leading `-` must never reach a config file or a command.
 */
import { isReservedProject } from "../ops/rules";

export class CoreInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoreInputError";
  }
}

/** The kit-db name (brief F1: `^[a-z0-9_]+$`), also starting with a letter or digit so it is
 * a valid Docker container name prefix and a file name that is never mistaken for a flag. */
const PROJECT = /^[a-z0-9][a-z0-9_]{0,39}$/;
const SHA = /^[0-9a-f]{7,40}$/;
/** A DNS hostname: labels of letters, digits and hyphens, not starting or ending in a hyphen. */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** registry/path[:tag][@sha256:digest] — no whitespace, no leading `-`. */
const IMAGE =
  /^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(?:@sha256:[0-9a-f]{64})?$/;
const ABS_PATH = /^\/[A-Za-z0-9._/-]*$/;

export function assertProject(name: string): string {
  if (!PROJECT.test(name)) {
    throw new CoreInputError(
      `invalid project name "${name}": expected ^[a-z0-9][a-z0-9_]{0,39}$`,
    );
  }
  // Its database would be one kit-deploy does not own (D048).
  if (isReservedProject(name)) {
    throw new CoreInputError(`"${name}" is reserved: not a project name`);
  }
  return name;
}

export function assertSha(sha: string): string {
  if (!SHA.test(sha)) {
    throw new CoreInputError(
      `invalid git sha "${sha}": expected 7–40 hex chars`,
    );
  }
  return sha;
}

export function assertHost(host: string): string {
  const labels = host.split(".");
  if (
    host.length > 253 ||
    labels.length < 2 ||
    !labels.every((l) => HOST_LABEL.test(l)) ||
    // An all-numeric TLD is an IP address (127.0.0.1), not a domain.
    /^[0-9]+$/.test(labels.at(-1) ?? "")
  ) {
    throw new CoreInputError(`invalid hostname "${host}"`);
  }
  return host;
}

export function assertImage(image: string): string {
  if (image.length > 255 || !IMAGE.test(image)) {
    throw new CoreInputError(`invalid image reference "${image}"`);
  }
  return image;
}

export function assertAbsolutePath(path: string): string {
  if (!ABS_PATH.test(path) || path.split("/").includes("..")) {
    throw new CoreInputError(`invalid absolute path "${path}"`);
  }
  return path;
}

export function assertIntInRange(
  what: string,
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CoreInputError(`${what} ${value} out of range ${min}–${max}`);
  }
  return value;
}
