/**
 * A project off the platform (D059), for the CLI (`kit-deploy project rm`) and the panel
 * (Eliminar proyecto, D069): the same steps in the same order. The rows first, so no deploy, cron
 * call, domain check or alert acts on the project while the machine is cleaned; then kit-agent's
 * `project.remove` (Caddy files, containers, images, pin). The kit-db databases are never touched
 * (D060). Each front end words the result.
 */
import type { ProjectRemoval } from "../../agent/project-remove";
import { type AgentClient, AgentUnreachable } from "../../cli/client";
import type { AuditEntry } from "../db/audit";
import type { ProjectFootprint, ProjectRemovalStore } from "../db/project-remove";

/** kit-agent's `project.remove`, or why it did not answer (English: the agent's own words). */
export async function agentRemove(
  client: AgentClient,
  project: string,
  dryRun: boolean,
): Promise<ProjectRemoval | string> {
  try {
    const res = await client.call("project.remove", { project, dryRun });
    if (!res.ok) return `kit-agent: ${res.error.code}: ${res.error.message}`;
    return res.result as ProjectRemoval;
  } catch (e) {
    if (e instanceof AgentUnreachable) return e.message;
    throw e;
  }
}

/** Nothing of the project on the machine: no Caddy file, container, image or pin. */
export function emptyMachine(m: ProjectRemoval): boolean {
  return (
    m.sites.length === 0 &&
    m.containers.length === 0 &&
    m.images.length === 0 &&
    m.pin === null
  );
}

export type RemovalRun = {
  /** The project's rows went in this run (false: there were none). */
  rowsRemoved: boolean;
  /** What kit-agent removed, or why it did not answer (the rows are gone either way). */
  machine: ProjectRemoval | string;
};

/**
 * The removal itself, after the caller checked the name and its confirmation. `rows` is the
 * footprint the caller read (null: no rows, maybe machine leftovers). A run that only found
 * leftovers on the machine still writes its audit row.
 */
export async function removeProject(
  client: AgentClient,
  store: ProjectRemovalStore,
  input: { project: string; rows: ProjectFootprint | null; audit: AuditEntry },
): Promise<RemovalRun> {
  const { project, rows, audit } = input;
  // The rows first: from here on nothing deploys, calls, checks or regenerates this project.
  const rowsRemoved = rows !== null && (await store.remove(project, audit));
  const machine = await agentRemove(client, project, false);
  if (typeof machine !== "string" && !rowsRemoved && !emptyMachine(machine))
    await store.record(audit);
  return { rowsRemoved, machine };
}
