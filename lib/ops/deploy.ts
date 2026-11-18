/**
 * Redeploy, rebuild, Parar / Reiniciar and the project's databases, for the CLI and the panel.
 * The switch itself (deploy, rollback, regenerate) is lib/deploy/switch.ts; these are the steps
 * around it that both front ends share.
 */
import type { AgentClient } from "../../cli/client";
import { assertProject } from "../core/validate";
import type { AdminStore } from "../db/admin";
import type { GitHubRequest } from "../deploy/github";
import { dispatchRebuild } from "../deploy/rebuild";
import type { SwitchRepo } from "../deploy/repo";
import { callAgent, OpsError } from "./agent";

/**
 * A queued copy of the scope's live deployment (same commit and image, the next generation): a
 * new container with the variables as they are now (phase 04 U8). The caller runs the switch
 * (`processProject`): the CLI waits for it, the panel answers first and runs it after.
 */
export async function queueRedeploy(
  repo: SwitchRepo,
  project: string,
  pr: number | null,
): Promise<{
  projectId: string;
  where: string;
  queued: { id: string; sha: string; generation: number };
}> {
  const name = assertProject(project);
  const p = await repo.projectByName(name);
  if (!p) throw new OpsError("not_found", `no project ${name}`);
  const where = pr === null ? "production" : `pr-${pr}`;
  const queued = await repo.queueRedeploy(p.id, pr);
  if (!queued)
    throw new OpsError(
      "conflict",
      `nothing live in ${name} ${where} to redeploy (an asleep preview wakes on its next push)`,
    );
  return { projectId: p.id, where, queued };
}

export type RebuildOutcome =
  | { ok: true; repo: string; branch: string }
  | { ok: false; reason: "no_project" }
  | { ok: false; reason: "no_token"; repo: string }
  | { ok: false; reason: "dispatch"; repo: string; detail: string };

/** `rebuild` (U8b): GitHub runs the project's deploy-vps.yml on its production branch with
 * `rebuild: true`; it builds with today's NEXT_PUBLIC_* values and redeploys. */
export async function startRebuild(
  admin: AdminStore,
  /** Asked for only once the project is known: on the VPS it reads root's token file. */
  github: () => GitHubRequest | null,
  project: string,
): Promise<RebuildOutcome> {
  const name = assertProject(project);
  const repo = await admin.projectRepo(name);
  const branch = await admin.productionBranch(name);
  if (repo === null || branch === null)
    return { ok: false, reason: "no_project" };
  const request = github();
  if (!request) return { ok: false, reason: "no_token", repo };
  try {
    await dispatchRebuild(request, repo, branch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "dispatch", repo, detail: msg };
  }
  return { ok: true, repo, branch };
}

/** The container production runs on (its live deployment's), or null when nothing is live. */
export async function productionContainer(
  repo: SwitchRepo,
  project: string,
): Promise<string | null> {
  const name = assertProject(project);
  const site = (await repo.liveSites()).find((s) => s.project === name);
  return site?.container ?? null;
}

/**
 * Parar: production's container stops; its deployment stays live, so Caddy answers 502 until
 * Reiniciar, a new deploy or a rollback, or root's `kit-deploy regenerate` (which starts every
 * stopped live container). A domain change or the domain check rewrite only the Caddy file and
 * never start it (D047); Docker's `unless-stopped` keeps it stopped across a reboot.
 */
export async function stopProduction(
  deps: { agent: AgentClient; repo: SwitchRepo },
  project: string,
): Promise<{ container: string }> {
  const container = await productionContainer(deps.repo, project);
  if (!container)
    throw new OpsError("conflict", `nothing live in ${project} production`);
  await callAgent(deps.agent, "container.stop", { name: container });
  return { container };
}

/** Reiniciar: stop (gracefully) and start the same container; a stopped one just starts. */
export async function restartProduction(
  deps: { agent: AgentClient; repo: SwitchRepo },
  project: string,
): Promise<{ container: string }> {
  const container = await productionContainer(deps.repo, project);
  if (!container)
    throw new OpsError("conflict", `nothing live in ${project} production`);
  await callAgent(deps.agent, "container.stop", { name: container });
  await callAgent(deps.agent, "container.start", { name: container });
  return { container };
}

/** `db create`: kit-db's `<project>` and `<project>_preview` (kept if there). The URLs never
 * reach the caller: the agent drops kit-db's output. */
export async function createDatabases(
  agent: AgentClient,
  project: string,
): Promise<{ database: string; created: boolean }[]> {
  return (await callAgent(agent, "db.create", {
    project: assertProject(project),
  })) as { database: string; created: boolean }[];
}
