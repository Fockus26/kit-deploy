/**
 * Nuevo proyecto, its deploy token, revoking tokens and "Crear base" (HANDOFF §3). A token comes
 * back once, in the action's result, and is never stored, logged or shown again: only its hash is
 * in the database. The image pin is root's (`kit-deploy project pin`): a project made here gets
 * its variables in containers once César pins it over SSH (D034).
 */
import { AdminError } from "@/lib/db/admin";
import { webActor } from "@/lib/db/env-store";
import { AgentRefused } from "@/lib/ops/agent";
import { createDatabases } from "@/lib/ops/deploy";
import { addProject, createDeployToken } from "@/lib/ops/projects";
import {
  projectCreateSchema,
  projectOnlySchema,
  tokenCreateSchema,
  tokenRevokeSchema,
} from "@/lib/panel/schemas";
import {
  type ActionResult,
  confirmationFailure,
  confirms,
  failure,
  runAction,
} from "./core";
import type { ActionDeps } from "./deps";

/** The label of the token a new project gets from the panel. */
export const NEW_PROJECT_TOKEN_LABEL = "panel: nuevo proyecto";

export type ProjectCreateResult = ActionResult<{
  project: string;
  repo: string;
  hosts: string[];
  /** `kdt_…`, shown once (HANDOFF: "Ya lo guardé", then never again). */
  token: string;
  /** What to run to hand it to GitHub, and what root has to run so its images get variables. */
  ghCommand: string;
  pinCommand: string;
}>;

export async function createProject(
  deps: ActionDeps,
  raw: unknown,
): Promise<ProjectCreateResult> {
  return runAction(
    deps,
    projectCreateSchema,
    raw,
    { action: "project.add" },
    async (input, user) => {
      const actor = webActor(user.userId);
      let hosts: string[];
      try {
        ({ hosts } = await addProject(
          deps.admin,
          {
            name: input.name,
            repo: input.repo,
            memoryMb: input.memoryMb,
            productionBranch: input.branch,
          },
          actor,
        ));
      } catch (e) {
        if (e instanceof AdminError && /already exists/.test(e.message))
          return failure(
            "conflict",
            `Ya hay un proyecto llamado ${input.name}, con el repo ${input.repo} o con su dominio.`,
            { name: "Ya existe." },
          );
        throw e;
      }
      const { token } = await createDeployToken(
        deps.admin,
        input.name,
        NEW_PROJECT_TOKEN_LABEL,
        actor,
      );
      deps.revalidate("/", "layout");
      return {
        ok: true,
        project: input.name,
        repo: input.repo,
        hosts,
        token,
        ghCommand: `gh secret set KIT_DEPLOY_TOKEN -R ${input.repo}`,
        pinCommand: `ssh kit-vps kit-deploy project pin ${input.name} ${input.repo}`,
      };
    },
  );
}

export type TokenCreateResult = ActionResult<{
  id: string;
  project: string;
  token: string;
}>;

export async function createToken(
  deps: ActionDeps,
  raw: unknown,
): Promise<TokenCreateResult> {
  return runAction(
    deps,
    tokenCreateSchema,
    raw,
    { action: "token.create" },
    async ({ project, label }, user) => {
      const { id, token } = await createDeployToken(
        deps.admin,
        project,
        label,
        webActor(user.userId),
      );
      deps.revalidate("/settings");
      return { ok: true, id, project, token };
    },
  );
}

export type TokenRevokeResult = ActionResult<{
  id: string;
  /** False on a second submit: it was already revoked. */
  revoked: boolean;
}>;

/** Revocar: the token's project name typed in the dialog, checked here again. */
export async function revokeToken(
  deps: ActionDeps,
  raw: unknown,
  now: () => Date = () => new Date(),
): Promise<TokenRevokeResult> {
  return runAction(
    deps,
    tokenRevokeSchema,
    raw,
    { action: "token.revoke" },
    async ({ id, confirm }, user) => {
      const token = await deps.tokens.find(id);
      if (!token) return failure("not_found", "Ese token no existe.");
      if (!confirms(confirm, token.project))
        return confirmationFailure(token.project);
      const revoked = await deps.tokens.revoke(id, now(), {
        actor: webActor(user.userId),
        action: "token.revoke",
        project: token.project,
        name: token.label,
      });
      deps.revalidate("/settings");
      return { ok: true, id, revoked };
    },
  );
}

export type DatabasesCreateResult = ActionResult<{
  databases: { database: string; created: boolean }[];
}>;

/** Crear base: kit-db's `<project>` and `<project>_preview`; DATABASE_URL reaches the
 * containers by itself from the next deploy (pinned image only). Idempotent. */
export async function createProjectDatabases(
  deps: ActionDeps,
  raw: unknown,
): Promise<DatabasesCreateResult> {
  return runAction(
    deps,
    projectOnlySchema,
    raw,
    { action: "db.create" },
    async ({ project }) => {
      // Never kit-db databases for a name that is not a project.
      if ((await deps.admin.projectRepo(project)) === null)
        return failure("not_found", "Ese proyecto no existe.");
      try {
        const databases = await createDatabases(deps.agent, project);
        deps.revalidate(`/p/${project}/databases`);
        deps.revalidate(`/p/${project}/env`);
        return { ok: true, databases };
      } catch (e) {
        if (e instanceof AgentRefused && e.code === "command_failed")
          return failure(
            "failed",
            "kit-db no pudo crear las bases. Revisa kit-db en el VPS (kit-db list).",
          );
        throw e;
      }
    },
  );
}
