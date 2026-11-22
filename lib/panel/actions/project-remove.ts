/**
 * Proyecto › Eliminar proyecto (D069): the same removal as `kit-deploy project rm --yes` (D059,
 * lib/ops/project-remove.ts), behind the project's name typed and a fresh code from the account's
 * authenticator app, checked on the server (D055). The databases are never touched (D060).
 *
 * Order: session → form → the typed name → never a reserved or `_preview` name → TOTP on? → the
 * shared guard → the code → kit-agent answers a dry run (nothing is touched while it is down) →
 * the rows → kit-agent's `project.remove`. A wrong code leaves a `kit-deploy-auth: failed sign-in
 * …` line, the one the fail2ban jail matches (D003). The code never reaches a result, a message or
 * a log line.
 */

import type { AgentClient } from "@/cli/client";
import { failedLine } from "@/lib/auth/handler";
import type { TotpGuard, TotpVerifier } from "@/lib/auth/totp-check";
import { webActor } from "@/lib/db/env-store";
import type {
  ProjectFootprint,
  ProjectRemovalStore,
} from "@/lib/db/project-remove";
import {
  agentRemove,
  emptyMachine,
  removeProject,
} from "@/lib/ops/project-remove";
import { isReservedProject } from "@/lib/ops/rules";
import { projectOnlySchema, projectRemoveSchema } from "@/lib/panel/schemas";
import {
  type ActionResult,
  AGENT_DOWN,
  confirmationFailure,
  confirms,
  failure,
  runAction,
  type SessionSource,
} from "./core";

export type ProjectRemoveDeps = SessionSource & {
  agent: AgentClient;
  removal: ProjectRemovalStore;
  /** The account has a confirmed authenticator app (`auth_user.two_factor_enabled`). */
  totpEnabled(userId: string): Promise<boolean>;
  verifyTotp: TotpVerifier;
  /** The panel's one guard (lib/panel/totp-guard.ts), shared with the other TOTP actions. */
  guard: TotpGuard;
  /** The client's address as Caddy forwarded it, "-" without one. */
  clientIp(): Promise<string>;
  log(line: string): void;
  revalidate(path: string, type?: "page" | "layout"): void;
};

/** The `path=` of the failed line: not an HTTP route, so the jail can tell it apart. */
export const PROJECT_REMOVE_PATH = "/panel/project-remove";

/* PLACEHOLDER (CONTENT_CHECKLIST row 50): the action's error texts are provisional. */
export const PROJECT_REMOVE_COPY = {
  notFound: "Ese proyecto no existe.",
  reserved:
    "Ese nombre es de la plataforma o de las bases de previews: no se elimina desde el panel.",
  wrongCode:
    "El código no coincide. Escribe el que muestra ahora tu app de autenticación; si sigue fallando, revisa que la hora del teléfono sea automática.",
  wrongCodeField: "El código no coincide.",
  reused:
    "Ese código ya se usó. Espera a que tu app muestre el siguiente y escríbelo.",
  reusedField: "Ese código ya se usó.",
  tooMany:
    "Demasiados códigos incorrectos. Espera 15 minutos antes de volver a intentarlo.",
  noTotp:
    "Tu cuenta no tiene app de autenticación, así que no hay con qué confirmar. Configúrala con un enlace de alta y vuelve a intentarlo.",
  agentDown: `${AGENT_DOWN} No se eliminó nada: inténtalo cuando kit-agent responda.`,
} as const;

export type ProjectFootprintResult = ActionResult<{
  project: string;
  footprint: ProjectFootprint;
}>;

/** What the dialog lists before confirming: names and counts, never a value. */
export async function projectRemovalFootprint(
  deps: ProjectRemoveDeps,
  raw: unknown,
): Promise<ProjectFootprintResult> {
  return runAction(
    deps,
    projectOnlySchema,
    raw,
    { action: "project.remove.footprint" },
    async ({ project }) => {
      const footprint = await deps.removal.footprint(project);
      if (!footprint) return failure("not_found", PROJECT_REMOVE_COPY.notFound);
      return { ok: true, project, footprint };
    },
  );
}

export type ProjectRemoveResult = ActionResult<{
  project: string;
  /** Nothing was left of it (a second submit): no rows, nothing on the machine. */
  already: boolean;
  /** The rows are gone but kit-agent did not finish (it stopped answering, or a step failed):
   * `kit-deploy project rm <p> --yes` finishes it. */
  partial: boolean;
}>;

export async function removeProjectFromPanel(
  deps: ProjectRemoveDeps,
  raw: unknown,
): Promise<ProjectRemoveResult> {
  return runAction(
    deps,
    projectRemoveSchema,
    raw,
    // `quiet`: the input holds a code; nothing about it is ever logged.
    { action: "project.remove", quiet: true },
    async ({ project, confirm, code }, user) => {
      if (!confirms(confirm, project)) return confirmationFailure(project);
      // The platform's own databases and every project's previews database: never a project.
      if (isReservedProject(project) || project.endsWith("_preview"))
        return failure("invalid", PROJECT_REMOVE_COPY.reserved);

      const refused = async (status: number) =>
        deps.log(
          failedLine(await deps.clientIp(), PROJECT_REMOVE_PATH, status),
        );

      if (!(await deps.totpEnabled(user.userId)))
        return failure("conflict", PROJECT_REMOVE_COPY.noTotp);

      const gate = deps.guard.attempt(user.userId, code);
      if (gate === "blocked") {
        await refused(429);
        return failure("too_many", PROJECT_REMOVE_COPY.tooMany);
      }
      if (gate === "reused")
        return failure("confirmation", PROJECT_REMOVE_COPY.reused, {
          code: PROJECT_REMOVE_COPY.reusedField,
        });

      let verdict: Awaited<ReturnType<TotpVerifier>>;
      try {
        verdict = await deps.verifyTotp(user.userId, code);
      } catch (e) {
        deps.guard.failed(user.userId, code);
        throw e;
      }
      if (verdict !== "ok") {
        deps.guard.failed(user.userId, code);
        if (verdict === "not_enabled")
          return failure("conflict", PROJECT_REMOVE_COPY.noTotp);
        await refused(401);
        return failure("confirmation", PROJECT_REMOVE_COPY.wrongCode, {
          code: PROJECT_REMOVE_COPY.wrongCodeField,
        });
      }
      deps.guard.succeeded(user.userId);

      // kit-agent must answer before the rows go: with it down the rows would be gone and the
      // site still served, with nothing in the panel to finish it from.
      const preflight = await agentRemove(deps.agent, project, true);
      if (typeof preflight === "string") {
        deps.log(`panel action project.remove: ${project}: ${preflight}`);
        return failure("agent", PROJECT_REMOVE_COPY.agentDown);
      }

      const rows = await deps.removal.footprint(project);
      const { rowsRemoved, machine } = await removeProject(
        deps.agent,
        deps.removal,
        {
          project,
          rows,
          audit: {
            actor: webActor(user.userId),
            action: "project.remove",
            project,
            environment: null,
            name: rows?.repo ?? null,
          },
        },
      );
      deps.revalidate("/");
      deps.revalidate(`/p/${project}`, "layout");

      if (typeof machine === "string") {
        deps.log(`panel action project.remove: ${project}: ${machine}`);
        return { ok: true, project, already: false, partial: true };
      }
      for (const line of machine.failed)
        deps.log(`panel action project.remove: ${project}: failed: ${line}`);
      return {
        ok: true,
        project,
        already: !rowsRemoved && emptyMachine(machine),
        partial: machine.failed.length > 0,
      };
    },
  );
}
