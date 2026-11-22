"use server";
/**
 * Proyecto › Eliminar proyecto (D069), confirmed with the name typed and a fresh TOTP code. For
 * `useActionState(action, null)`; the logic is lib/panel/actions/project-remove.ts. Removed (or
 * half removed) → Inicio, whose notice says which (D070): the project's own pages are gone.
 */
import { redirect } from "next/navigation";
import { payload } from "@/lib/panel/actions/form";
import {
  type ProjectFootprintResult,
  type ProjectRemoveResult,
  projectRemovalFootprint,
  removeProjectFromPanel,
} from "@/lib/panel/actions/project-remove";
import { projectRemoveDeps } from "@/lib/panel/project-remove-runtime";
import { removedNoticeHref } from "@/lib/panel/removed-notice";

export async function projectFootprintAction(
  _prev: unknown,
  form: FormData,
): Promise<ProjectFootprintResult> {
  return projectRemovalFootprint(projectRemoveDeps(), payload(form));
}

export async function removeProjectAction(
  _prev: unknown,
  form: FormData,
): Promise<ProjectRemoveResult> {
  const r = await removeProjectFromPanel(projectRemoveDeps(), payload(form));
  // Outside any try: Next's redirect is a throw.
  if (r.ok) redirect(removedNoticeHref(r));
  return r;
}
