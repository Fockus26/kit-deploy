/**
 * Variables from the panel (brief F4, HANDOFF §3 Variables). The value is read once from the
 * form, sealed by kit-agent and dropped: it is never returned, logged, revalidated or put in an
 * error, and a secret is never readable afterwards — only replaceable.
 */
import type { Environment } from "@/lib/core/env";
import { webActor } from "@/lib/db/env-store";
import { AgentRefused } from "@/lib/ops/agent";
import { type EnvNeeds, removeVariable, setVariable } from "@/lib/ops/env";
import { envRemoveSchema, envSetSchema } from "@/lib/panel/schemas";
import {
  type ActionResult,
  confirmationFailure,
  confirms,
  failure,
  runAction,
} from "./core";
import type { ActionDeps } from "./deps";

export const ENV_LABEL: Record<Environment, string> = {
  production: "Producción",
  preview: "Preview",
  development: "Desarrollo",
};

/** The strongest of what each environment needs: a rebuild covers a redeploy. */
export function strongest(needs: EnvNeeds[]): EnvNeeds {
  if (needs.includes("rebuild")) return "rebuild";
  if (needs.includes("redeploy")) return "redeploy";
  return null;
}

export type EnvSetResult = ActionResult<{
  name: string;
  secret: boolean;
  environments: Environment[];
  /** Per environment: a new variable, or a replaced one. */
  created: Partial<Record<Environment, boolean>>;
  /** The notice after saving (HANDOFF §3): Rebuild for NEXT_PUBLIC_*, Redeploy otherwise. */
  needs: EnvNeeds;
}>;

/** Fixed words for kit-agent's refusal: its message is never shown (nor the value). */
function sealFailure(e: AgentRefused, saved: Environment[]) {
  const done = saved.length
    ? ` Se guardó en ${saved.map((s) => ENV_LABEL[s]).join(", ")}.`
    : "";
  return failure(
    e.code === "bad_request" || e.code === "forbidden" ? "invalid" : "agent",
    `kit-agent no pudo cifrar el valor (${e.code}).${done}`,
  );
}

export async function setEnvVar(
  deps: ActionDeps,
  raw: unknown,
): Promise<EnvSetResult> {
  return runAction(
    deps,
    envSetSchema,
    raw,
    { action: "env.set", quiet: true },
    async (input, user) => {
      const created: Partial<Record<Environment, boolean>> = {};
      const saved: Environment[] = [];
      const needs: EnvNeeds[] = [];
      let secret = input.secret;
      try {
        for (const environment of input.environments) {
          const r = await setVariable(
            { agent: deps.agent, store: deps.env },
            {
              project: input.project,
              environment,
              name: input.name,
              value: input.value,
              secret: input.secret,
            },
            webActor(user.userId),
          );
          created[environment] = r.created;
          secret = r.secret;
          needs.push(r.needs);
          saved.push(environment);
        }
      } catch (e) {
        if (e instanceof AgentRefused) return sealFailure(e, saved);
        throw e;
      }
      deps.revalidate(`/p/${input.project}/env`);
      return {
        ok: true,
        name: input.name,
        secret,
        environments: saved,
        created,
        needs: strongest(needs),
      };
    },
  );
}

export type EnvRemoveResult = ActionResult<{
  name: string;
  environment: Environment;
  /** False on a second submit: it was already gone. */
  removed: boolean;
  needs: EnvNeeds;
}>;

/** Borrar variable: the project's name typed in the dialog, checked here again. */
export async function removeEnvVar(
  deps: ActionDeps,
  raw: unknown,
): Promise<EnvRemoveResult> {
  return runAction(
    deps,
    envRemoveSchema,
    raw,
    { action: "env.remove", quiet: true },
    async (input, user) => {
      if (!confirms(input.confirm, input.project))
        return confirmationFailure(input.project);
      const { removed, needs } = await removeVariable(
        deps.env,
        input,
        webActor(user.userId),
      );
      deps.revalidate(`/p/${input.project}/env`);
      return {
        ok: true,
        name: input.name,
        environment: input.environment,
        removed,
        needs: removed ? needs : null,
      };
    },
  );
}
