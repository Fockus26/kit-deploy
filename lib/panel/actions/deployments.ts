/**
 * The project header's actions (HANDOFF §3 Proyecto · cabecera): Redeploy, Rollback, Rebuild,
 * Reiniciar and Parar, with the CLI's rules (lib/ops/deploy.ts, lib/deploy/switch.ts). Parar and
 * Rollback take the project's name typed in their dialog and check it here again.
 */
import type { AuditEntry } from "@/lib/db/audit";
import { webActor } from "@/lib/db/env-store";
import { processProject, rollback, SwitchError } from "@/lib/deploy/switch";
import { OpsError } from "@/lib/ops/agent";
import {
  queueRedeploy,
  restartProduction,
  startRebuild,
  stopProduction,
} from "@/lib/ops/deploy";
import {
  projectOnlySchema,
  redeploySchema,
  rollbackSchema,
  stopSchema,
} from "@/lib/panel/schemas";
import {
  type ActionResult,
  confirmationFailure,
  confirms,
  failure,
  runAction,
} from "./core";
import type { ActionDeps } from "./deps";

const NOT_FOUND = "Ese proyecto no existe.";

function refresh(deps: ActionDeps, project: string) {
  deps.revalidate(`/p/${project}`, "layout");
  deps.revalidate("/");
}

/**
 * The audit row of what already happened (D045): a failed write is logged, never turned into a
 * failure of an action that did run (the container is stopped either way).
 */
async function audited(deps: ActionDeps, entry: AuditEntry) {
  try {
    await deps.audit.record(entry);
  } catch (e) {
    console.error(
      `panel audit ${entry.action}:`,
      e instanceof Error ? e.message : e,
    );
  }
}

/** Stop and restart look for a live container: an unknown project is a 404 before that. */
async function known(deps: ActionDeps, project: string) {
  return (await deps.admin.projectRepo(project)) !== null;
}

export type RedeployResult = ActionResult<{
  deployment: { id: string; sha: string; generation: number };
  /** True when a second submit found the first one's deployment still on its way. */
  already: boolean;
}>;

/**
 * The live commit again, same image, a new container with today's variables. The panel answers
 * once it is queued; the switch (pull, start, health, Caddy) runs after the response, as the
 * deploy API does.
 */
export async function redeployProject(
  deps: ActionDeps,
  raw: unknown,
): Promise<RedeployResult> {
  return runAction(
    deps,
    redeploySchema,
    raw,
    { action: "redeploy" },
    async ({ project, pr }, user) => {
      const scope = pr ?? null;
      const open = await deps.openDeployment(project, scope);
      if (open) return { ok: true, deployment: open, already: true };
      try {
        const { projectId, queued } = await queueRedeploy(
          deps.switch.repo,
          project,
          scope,
        );
        deps.later(async () => {
          try {
            await processProject(deps.switch, projectId);
          } catch (e) {
            console.error(
              "redeploy switch:",
              e instanceof Error ? e.message : e,
            );
          }
        });
        await audited(deps, {
          actor: webActor(user.userId),
          action: "project.redeploy",
          project,
          environment: scope === null ? "production" : "preview",
          name: scope === null ? null : `PR #${scope}`,
        });
        refresh(deps, project);
        return { ok: true, deployment: queued, already: false };
      } catch (e) {
        if (e instanceof OpsError && e.code === "conflict")
          return failure(
            "conflict",
            scope === null
              ? `${project} no tiene nada en vivo en producción que redesplegar.`
              : `El preview del PR #${scope} no está en vivo: uno dormido despierta con su próximo push.`,
          );
        if (e instanceof OpsError) return failure("not_found", NOT_FOUND);
        throw e;
      }
    },
  );
}

export type RollbackResult = ActionResult<{
  from: string | null;
  to: string;
  seconds: number;
}>;

export async function rollbackProject(
  deps: ActionDeps,
  raw: unknown,
  now: () => number = Date.now,
): Promise<RollbackResult> {
  return runAction(
    deps,
    rollbackSchema,
    raw,
    { action: "rollback" },
    async ({ project, confirm, to }, user) => {
      if (!confirms(confirm, project)) return confirmationFailure(project);
      const t0 = now();
      try {
        const r = await rollback(
          deps.switch,
          project,
          to === undefined ? {} : { to },
        );
        await audited(deps, {
          actor: webActor(user.userId),
          action: "project.rollback",
          project,
          environment: "production",
          name: r.to,
        });
        refresh(deps, project);
        return {
          ok: true,
          ...r,
          seconds: Math.round((now() - t0) / 100) / 10,
        };
      } catch (e) {
        if (!(e instanceof SwitchError)) throw e;
        if (/^no project /.test(e.message))
          return failure("not_found", NOT_FOUND);
        if (/no earlier deployment|no kept deployment/.test(e.message))
          return failure(
            "conflict",
            to === undefined
              ? `${project} no tiene un despliegue anterior guardado al que volver.`
              : "Ese despliegue ya no está guardado: no se puede volver a él.",
          );
        if (/did not pass \/api\/health/.test(e.message))
          return failure(
            "failed",
            "El despliegue guardado no pasó /api/health: producción sigue en el actual.",
          );
        throw e;
      }
    },
  );
}

export type RebuildResult = ActionResult<{ repo: string; branch: string }>;

/** A NEXT_PUBLIC_* changed: GitHub builds production again and the platform redeploys it. */
export async function rebuildProject(
  deps: ActionDeps,
  raw: unknown,
): Promise<RebuildResult> {
  return runAction(
    deps,
    projectOnlySchema,
    raw,
    { action: "rebuild" },
    async ({ project }) => {
      const r = await startRebuild(deps.admin, () => deps.github(), project);
      if (r.ok) return { ok: true, repo: r.repo, branch: r.branch };
      if (r.reason === "no_project") return failure("not_found", NOT_FOUND);
      if (r.reason === "no_token")
        return failure(
          "failed",
          `El panel no tiene el token de GitHub (/etc/kit-deploy/github.env). Lánzalo con kit-deploy rebuild ${project} o desde la pestaña Actions de ${r.repo}.`,
        );
      console.error("panel action rebuild:", r.detail);
      return failure(
        "failed",
        /403|404/.test(r.detail)
          ? `GitHub no aceptó el rebuild: el token necesita Actions de lectura y escritura en ${r.repo}, y el repo el deploy-vps.yml nuevo.`
          : `GitHub no aceptó el rebuild de ${project}. Inténtalo de nuevo.`,
      );
    },
  );
}

export type ContainerResult = ActionResult<{ container: string }>;

function noLive(project: string) {
  return failure("conflict", `${project} no tiene nada en vivo en producción.`);
}

/** Parar: production's container stops (the site answers 502 until Reiniciar). */
export async function stopProject(
  deps: ActionDeps,
  raw: unknown,
): Promise<ContainerResult> {
  return runAction(
    deps,
    stopSchema,
    raw,
    { action: "stop" },
    async ({ project, confirm }, user) => {
      if (!(await known(deps, project))) return failure("not_found", NOT_FOUND);
      if (!confirms(confirm, project)) return confirmationFailure(project);
      try {
        const r = await stopProduction(
          { agent: deps.agent, repo: deps.switch.repo },
          project,
        );
        await audited(deps, {
          actor: webActor(user.userId),
          action: "project.stop",
          project,
          environment: "production",
        });
        refresh(deps, project);
        return { ok: true, ...r };
      } catch (e) {
        if (e instanceof OpsError) return noLive(project);
        throw e;
      }
    },
  );
}

/** Reiniciar: the same container stopped and started again (a stopped one just starts). */
export async function restartProject(
  deps: ActionDeps,
  raw: unknown,
): Promise<ContainerResult> {
  return runAction(
    deps,
    projectOnlySchema,
    raw,
    { action: "restart" },
    async ({ project }, user) => {
      if (!(await known(deps, project))) return failure("not_found", NOT_FOUND);
      try {
        const r = await restartProduction(
          { agent: deps.agent, repo: deps.switch.repo },
          project,
        );
        await audited(deps, {
          actor: webActor(user.userId),
          action: "project.restart",
          project,
          environment: "production",
        });
        refresh(deps, project);
        return { ok: true, ...r };
      } catch (e) {
        if (e instanceof OpsError) return noLive(project);
        throw e;
      }
    },
  );
}
