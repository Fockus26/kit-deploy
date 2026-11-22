/**
 * Inicio's notice after Eliminar proyecto (D070): the action redirects to `/?eliminado=<p>` (plus
 * `&estado=pendiente` when kit-agent did not finish, `&estado=ya` when nothing was left), and the
 * page words it. Only a valid project name that is not in the list any more is shown, so a link
 * cannot make Inicio say a live project was removed. Pure: no Node or database imports.
 */
import { PROJECT_RE } from "@/lib/ops/rules";

export const REMOVED_PARAM = "eliminado";
export const STATE_PARAM = "estado";

export function removedNoticeHref(r: {
  project: string;
  partial: boolean;
  already: boolean;
}): string {
  const q = new URLSearchParams({ [REMOVED_PARAM]: r.project });
  if (r.partial) q.set(STATE_PARAM, "pendiente");
  else if (r.already) q.set(STATE_PARAM, "ya");
  return `/?${q.toString()}`;
}

export type RemovedNotice = {
  tone: "info" | "warning";
  title: string;
  body: string;
  /** `kit-deploy project rm <p> --yes`, when the machine side is left to finish. */
  command?: string;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function removedNotice(
  search: Record<string, string | string[] | undefined>,
  projects: readonly string[],
): RemovedNotice | null {
  const project = one(search[REMOVED_PARAM]);
  if (!project || !PROJECT_RE.test(project) || projects.includes(project))
    return null;
  const state = one(search[STATE_PARAM]);
  const dbs = `${project} y ${project}_preview`;
  /* PLACEHOLDER (CONTENT_CHECKLIST row 51): the notice's texts are provisional. */
  if (state === "pendiente")
    return {
      tone: "warning",
      title: `${project} eliminado del panel, pero quedó algo en el servidor`,
      body: "Sus datos del panel ya no están, pero kit-agent no terminó de quitar sus contenedores, archivos de Caddy o imágenes. Termínalo como root con:",
      command: `kit-deploy project rm ${project} --yes`,
    };
  if (state === "ya")
    return {
      tone: "info",
      title: `${project} ya estaba eliminado`,
      body: "No quedaba nada suyo en el panel ni en el servidor.",
    };
  return {
    tone: "info",
    title: `${project} eliminado`,
    body: `Se fueron sus despliegues, previews, dominios, variables, tokens, cron jobs, contenedores y archivos de Caddy. Sus bases de datos (${dbs}, si existen) y el registro de auditoría se conservan.`,
  };
}
