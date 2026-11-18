/**
 * The words the Variables, Dominios and Previews pages put on the panel's data (HANDOFF §3):
 * pure, shared by the server pages and their client parts, tested in panel-resource-labels.
 */
import type { Status } from "@/components/kit/status-badge";
import type { Environment } from "@/lib/core/env";
import type {
  DeploymentStatus,
  DomainRedirect,
  DomainStatus,
} from "@/lib/db/schema";

export const ENV_TAB_LABEL: Record<Environment, string> = {
  production: "Producción",
  preview: "Preview",
  development: "Desarrollo",
};

/** "Producción, Preview y Desarrollo". */
export function envListText(envs: readonly Environment[]): string {
  const words = envs.map((e) => ENV_TAB_LABEL[e]);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} y ${words.at(-1)}`;
}

export const DOMAIN_BADGE: Record<DomainStatus, Status> = {
  pending_dns: "verifying",
  issuing: "issuing",
  ready: "ready",
  error: "error",
};

/** The add form's three options, in the order the radio shows them. */
export const REDIRECT_OPTIONS: { value: DomainRedirect; label: string }[] = [
  { value: "none", label: "Sirve el sitio (sin redirección)" },
  { value: "to_apex", label: "Redirige a la versión sin www" },
  { value: "to_www", label: "Redirige a la versión con www" },
];

const DAY_MS = 86_400_000;

/** Whole days left until `notAfter` (0 once it is today or past). */
export function daysLeft(notAfter: Date, now: Date): number {
  return Math.max(0, Math.floor((+notAfter - +now) / DAY_MS));
}

/** The Certificado cell: what it says for each tone of `DomainItem.certTone`. */
export function certText(
  tone: "ok" | "soon" | "error" | "none",
  notAfter: Date | null,
  now: Date,
): string {
  if (tone === "error") return "Error";
  if (!notAfter) return "Sin emitir";
  const days = daysLeft(notAfter, now);
  if (tone === "soon")
    return days === 0
      ? "Vence hoy"
      : days === 1
        ? "Vence en 1 día"
        : `Vence en ${days} días`;
  return `Válido ${days} días más`;
}

/** What a preview's host serves, as a StatusBadge. */
export function previewBadge(status: DeploymentStatus): Status {
  switch (status) {
    case "live":
      return "active";
    case "asleep":
      return "sleeping";
    case "queued":
    case "starting":
      return "building";
    case "failed":
      return "failed";
    default:
      return "saved";
  }
}

/** The previews limit notice (D017): "N de 4 encendidos", and what happens at the limit. */
export function previewsLimitText(
  running: number,
  limit: number,
): { title: string; body: string } {
  const title = `${running} de ${limit} encendidos`;
  if (running >= limit)
    return {
      title,
      body: "El más antiguo se dormirá en el próximo push.",
    };
  const free = limit - running;
  return {
    title,
    body:
      free === 1
        ? "Queda 1 hueco: al llenarse, el preview más antiguo se duerme con cada push nuevo."
        : `Quedan ${free} huecos: al llenarse, el preview más antiguo se duerme con cada push nuevo.`,
  };
}
