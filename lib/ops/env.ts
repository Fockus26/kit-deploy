/**
 * A project's variables (brief F4), for `kit-deploy env` and the panel's Variables page. The value
 * reaches kit-agent's `env.seal` and nothing else: it is never returned, logged or put in an
 * error. A secret cannot be read back by anyone: only plain values come out of `env.reveal`.
 */
import type { AgentClient } from "../../cli/client";
import type { Sealed } from "../core/crypto";
import {
  assertEnvironment,
  assertEnvName,
  assertEnvValue,
  type Environment,
  isPublicName,
} from "../core/env";
import { assertProject } from "../core/validate";
import type { EnvStore, StoredVar } from "../db/env-store";
import { callAgent } from "./agent";

export type EnvOpsDeps = { agent: AgentClient; store: EnvStore };

/** What a change needs before the running site sees it: a runtime variable a new container
 * (redeploy), a NEXT_PUBLIC_* a new build (Next inlines it), Development nothing (`env pull`). */
export type EnvNeeds = "redeploy" | "rebuild" | null;

export function needsAfterChange(
  name: string,
  environment: Environment,
): EnvNeeds {
  if (environment === "development") return null;
  return isPublicName(name) ? "rebuild" : "redeploy";
}

/** Seals the value with kit-agent and stores it (with its audit row). NEXT_PUBLIC_* is plain
 * whatever `secret` says: it ships in the browser bundle. */
export async function setVariable(
  deps: EnvOpsDeps,
  input: {
    project: string;
    environment: string;
    name: string;
    value: string;
    secret: boolean;
  },
  actor: string,
): Promise<{
  created: boolean;
  name: string;
  secret: boolean;
  needs: EnvNeeds;
}> {
  const project = assertProject(input.project);
  const environment = assertEnvironment(input.environment);
  const name = assertEnvName(input.name);
  const secret = input.secret && !isPublicName(name);
  const value = assertEnvValue(input.value);
  const sealed = (await callAgent(deps.agent, "env.seal", {
    project,
    environment,
    name,
    secret,
    value,
  })) as Sealed;
  const { created } = await deps.store.set(
    project,
    environment,
    { name, secret, sealed },
    actor,
  );
  return { created, name, secret, needs: needsAfterChange(name, environment) };
}

/** False when there was nothing to remove (and then no audit row). */
export async function removeVariable(
  store: EnvStore,
  input: { project: string; environment: string; name: string },
  actor: string,
): Promise<{ removed: boolean; needs: EnvNeeds }> {
  const project = assertProject(input.project);
  const environment = assertEnvironment(input.environment);
  const name = assertEnvName(input.name);
  const removed = await store.remove(project, environment, name, actor);
  return { removed, needs: needsAfterChange(name, environment) };
}

/** The plain values of `rows`, by name, opened by kit-agent; secrets are never sent to it. */
export async function revealPlain(
  agent: AgentClient,
  project: string,
  environment: Environment,
  rows: readonly StoredVar[],
): Promise<Map<string, string>> {
  const plain = rows.filter((r) => !r.secret);
  const values = new Map<string, string>();
  if (plain.length === 0) return values;
  const result = (await callAgent(agent, "env.reveal", {
    project,
    environment,
    vars: plain.map(({ name, secret, sealed }) => ({ name, secret, sealed })),
  })) as { name: string; value: string }[];
  for (const v of result) values.set(v.name, v.value);
  return values;
}
