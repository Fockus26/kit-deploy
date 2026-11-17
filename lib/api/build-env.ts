/**
 * `POST /api/v1/build-env { "environment": "production" | "preview" }` with the project's deploy
 * token (brief, Architecture: "the Action asks kit-deploy for the public variables of its
 * environment; secrets never reach the Action"). The answer is a ready `.env` for `next build`:
 * the environment's plain `NEXT_PUBLIC_*` variables and the project's Server Actions key for that
 * environment (Next 16 embeds it at build). The token decides the project; the web app never
 * opens a value — kit-agent does, and refuses anything but those (`env.build`).
 */
import { z } from "zod";
import type { Response as AgentResponse } from "@/agent/protocol";
import type { AgentClient } from "@/cli/client";
import { dotenvLine, isPublicName } from "@/lib/core/env";
import type { DeployStore } from "@/lib/db/store";
import type { SealedVar } from "@/lib/deploy/repo";
import { authorize, json } from "./deploy";

const Body = z.strictObject({ environment: z.enum(["production", "preview"]) });

export type BuildEnvDeps = {
  agent: AgentClient;
  /** The environment's stored variables (the switch repo's `envVars`). */
  vars(
    projectId: string,
    environment: "production" | "preview",
  ): Promise<SealedVar[]>;
};

export async function handleBuildEnv(
  request: Request,
  store: DeployStore,
  deps: BuildEnvDeps,
): Promise<Response> {
  try {
    const auth = await authorize(
      request,
      store,
      Body,
      '{ environment: "production" | "preview" }',
    );
    if (!auth.ok) return auth.response;
    const { environment } = auth.body;
    const { project } = auth.found;
    // Only the public, plain ones leave the database for the agent: a secret's blob never does.
    const rows = (await deps.vars(project.id, environment)).filter(
      (v) => !v.secret && isPublicName(v.name),
    );
    const res: AgentResponse = await deps.agent.call("env.build", {
      project: project.name,
      environment,
      vars: rows,
    });
    if (!res.ok) {
      console.error(
        `build-env: kit-agent ${res.error.code}: ${res.error.message}`,
      );
      return json(502, { error: "kit-agent refused the build variables" });
    }
    const built = res.result as {
      variables: { name: string; value: string }[];
      serverActionsKey: string;
    };
    const dotenv =
      built.variables.map((v) => dotenvLine(v.name, v.value)).join("") +
      dotenvLine("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", built.serverActionsKey);
    return json(200, {
      environment,
      // The names, for the Action's log; the values only inside `dotenv`.
      names: built.variables.map((v) => v.name),
      dotenv,
    });
  } catch (e) {
    // Neither the token nor a value reaches the log: only the error.
    console.error("build-env:", e instanceof Error ? e.message : e);
    return json(500, { error: "internal error" });
  }
}
