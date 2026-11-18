"use server";
/**
 * Variables (HANDOFF §3). For `useActionState(action, null)` in the form; the logic and its rules
 * are lib/panel/actions/env.ts. The value is read once from the form and only kit-agent sees it.
 */
import {
  type EnvRemoveResult,
  type EnvSetResult,
  removeEnvVar,
  setEnvVar,
} from "@/lib/panel/actions/env";
import { payload } from "@/lib/panel/actions/form";
import { actionDeps } from "@/lib/panel/runtime";

export async function setEnvVarAction(
  _prev: unknown,
  form: FormData,
): Promise<EnvSetResult> {
  return setEnvVar(actionDeps(), payload(form, ["environments"]));
}

export async function removeEnvVarAction(
  _prev: unknown,
  form: FormData,
): Promise<EnvRemoveResult> {
  return removeEnvVar(actionDeps(), payload(form));
}
