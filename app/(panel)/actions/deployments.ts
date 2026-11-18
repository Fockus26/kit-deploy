"use server";
/**
 * The project header's actions (HANDOFF §3): Redeploy, Rollback, Rebuild, Reiniciar, Parar. For
 * `useActionState(action, null)`; the logic is lib/panel/actions/deployments.ts.
 */
import {
  type ContainerResult,
  type RebuildResult,
  type RedeployResult,
  type RollbackResult,
  rebuildProject,
  redeployProject,
  restartProject,
  rollbackProject,
  stopProject,
} from "@/lib/panel/actions/deployments";
import { payload } from "@/lib/panel/actions/form";
import { actionDeps } from "@/lib/panel/runtime";

export async function redeployAction(
  _prev: unknown,
  form: FormData,
): Promise<RedeployResult> {
  return redeployProject(actionDeps(), payload(form));
}

export async function rollbackAction(
  _prev: unknown,
  form: FormData,
): Promise<RollbackResult> {
  return rollbackProject(actionDeps(), payload(form));
}

export async function rebuildAction(
  _prev: unknown,
  form: FormData,
): Promise<RebuildResult> {
  return rebuildProject(actionDeps(), payload(form));
}

export async function stopAction(
  _prev: unknown,
  form: FormData,
): Promise<ContainerResult> {
  return stopProject(actionDeps(), payload(form));
}

export async function restartAction(
  _prev: unknown,
  form: FormData,
): Promise<ContainerResult> {
  return restartProject(actionDeps(), payload(form));
}
