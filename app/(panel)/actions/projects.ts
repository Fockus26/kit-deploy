"use server";
/**
 * Nuevo proyecto, deploy tokens and "Crear base" (HANDOFF §3). For `useActionState(action,
 * null)`; the logic is lib/panel/actions/projects.ts. A token comes back once, in the result.
 */
import { payload } from "@/lib/panel/actions/form";
import {
  createProject,
  createProjectDatabases,
  createToken,
  type DatabasesCreateResult,
  type ProjectCreateResult,
  revokeToken,
  type TokenCreateResult,
  type TokenRevokeResult,
} from "@/lib/panel/actions/projects";
import { actionDeps } from "@/lib/panel/runtime";

export async function createProjectAction(
  _prev: unknown,
  form: FormData,
): Promise<ProjectCreateResult> {
  return createProject(actionDeps(), payload(form));
}

export async function createTokenAction(
  _prev: unknown,
  form: FormData,
): Promise<TokenCreateResult> {
  return createToken(actionDeps(), payload(form));
}

export async function revokeTokenAction(
  _prev: unknown,
  form: FormData,
): Promise<TokenRevokeResult> {
  return revokeToken(actionDeps(), payload(form));
}

export async function createDatabasesAction(
  _prev: unknown,
  form: FormData,
): Promise<DatabasesCreateResult> {
  return createProjectDatabases(actionDeps(), payload(form));
}
