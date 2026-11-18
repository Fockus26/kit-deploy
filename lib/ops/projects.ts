/**
 * Registering a project and its deploy tokens, for `kit-deploy project add` / `token create` and
 * the panel's Nuevo proyecto. The image pin (which repository's images get the variables) is
 * root's: only the CLI run as root writes it (`project pin`), never the web app.
 */
import { MEMORY_MB } from "../core/constants";
import { defaultHost } from "../core/target";
import { assertHost, CoreInputError } from "../core/validate";
import type { AdminStore } from "../db/admin";
import { generateDeployToken } from "../tokens";
import {
  BRANCH_RE,
  isReservedProject,
  PROJECT_RE,
  REPO_RE,
  TOKEN_LABEL_MAX,
} from "./rules";

export {
  BRANCH_RE,
  DEFAULT_MEMORY_MB,
  isReservedProject,
  PROJECT_RE,
  REPO_RE,
  RESERVED_PROJECTS,
  TOKEN_LABEL_MAX,
} from "./rules";

/** `_preview` is the suffix of every project's previews database. */
export function isPreviewsSuffix(name: string): boolean {
  return name.endsWith("_preview");
}

/** An extra production host: lowercase, valid, not the platform's. */
export function extraHost(host: string): string {
  const h = host.toLowerCase();
  assertHost(h);
  if (h === "db.fockus.dev" || h === "deploy.fockus.dev") {
    throw new CoreInputError(`${h} is the platform's`);
  }
  return h;
}

/**
 * The project and its domains in one transaction: `<project>.fockus.dev` unless `defaultDomain`
 * is false, plus `extraHosts`. The caller has checked the name, repo and memory.
 */
export async function addProject(
  admin: AdminStore,
  input: {
    name: string;
    repo: string;
    memoryMb: number;
    productionBranch?: string;
    defaultDomain?: boolean;
    extraHosts?: readonly string[];
  },
  /** Who, for the audit row written with the project (D045); none = no row. */
  actor?: string,
): Promise<{ id: string; hosts: string[] }> {
  if (!PROJECT_RE.test(input.name) || isPreviewsSuffix(input.name))
    throw new CoreInputError(`invalid project name "${input.name}"`);
  // Its database would be the platform's or Postgres' own (D048).
  if (isReservedProject(input.name))
    throw new CoreInputError(`invalid project name "${input.name}": reserved`);
  if (!REPO_RE.test(input.repo))
    throw new CoreInputError(
      `invalid repo "${input.repo}": expected owner/name`,
    );
  if (
    !Number.isInteger(input.memoryMb) ||
    input.memoryMb < MEMORY_MB.min ||
    input.memoryMb > MEMORY_MB.max
  )
    throw new CoreInputError(
      `memory ${input.memoryMb}: expected ${MEMORY_MB.min}-${MEMORY_MB.max}`,
    );
  const branch = input.productionBranch;
  if (
    branch !== undefined &&
    (!BRANCH_RE.test(branch) || branch.includes(".."))
  )
    throw new CoreInputError(`invalid branch "${branch}"`);
  const hosts: string[] = [];
  if (input.defaultDomain !== false) {
    const d = defaultHost(input.name);
    if (!d)
      throw new CoreInputError(
        `${input.name} has no default domain (reserved)`,
      );
    hosts.push(d);
  }
  for (const h of input.extraHosts ?? []) hosts.push(extraHost(h));
  const unique = [...new Set(hosts)];
  const { id } = await admin.addProject(
    {
      name: input.name,
      repo: input.repo,
      memoryMb: input.memoryMb,
      hosts: unique,
      ...(branch === undefined ? {} : { productionBranch: branch }),
    },
    actor ? { actor, action: "project.add", project: input.name } : undefined,
  );
  return { id, hosts: unique };
}

/** A new deploy token: its hash is stored, the token goes back to the caller once and is never
 * stored, logged or shown again. */
export async function createDeployToken(
  admin: AdminStore,
  project: string,
  label: string,
  /** Who, for the audit row (the label as its name, never the token); none = no row. */
  actor?: string,
): Promise<{ id: string; token: string }> {
  const { token, hash } = generateDeployToken();
  const name = label.slice(0, TOKEN_LABEL_MAX);
  const { id } = await admin.addToken(
    project,
    hash,
    name,
    actor ? { actor, action: "token.create", project, name } : undefined,
  );
  return { id, token };
}
