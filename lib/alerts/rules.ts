/**
 * The alerts' rules (phase 06, brief F10, D047): what counts as failing, and for how many runs in a
 * row before an incident opens or resolves. `kit-deploy alerts check` runs once a minute, so a
 * count is minutes. Pure: tested without a database.
 */
import type { AlertKind } from "../db/schema";

/** A certificate that expires in fewer days than this is an alert (brief F10). */
export const CERT_WARN_DAYS = 14;
/** The VPS disk past this share of its size (brief F10). */
export const DISK_PCT = 80;
/** "Memory tight": used (MemTotal − MemAvailable) past this share of the RAM. */
export const MEMORY_PCT = 90;
/** kit-db backs up nightly: a database whose newest dump is older than this missed one. */
export const BACKUP_MAX_AGE_HOURS = 36;
/** A failed production deployment older than this is history, not an incident. */
export const DEPLOY_FAILED_WINDOW_DAYS = 7;
/** A VPS reading older than this says nothing about now (the collector runs every 30 s). */
export const VPS_SAMPLE_MAX_AGE_MS = 5 * 60_000;
/** One digest carries at most this many alerts; the rest go in the next run's. */
export const DIGEST_MAX = 50;
/** A streak row whose subject is no longer checked is removed after this. */
export const STREAK_TTL_MS = 24 * 3_600_000;

/**
 * Runs in a row: `openAfter` failing ones open the incident, `resolveAfter` fine ones close it.
 * A site gets three minutes (a deploy's switch or one slow answer is not an outage) and must stay
 * up five before "resuelta", so a flapping site sends two emails per real outage, not one a minute.
 */
export const RULES: Record<
  AlertKind,
  { openAfter: number; resolveAfter: number }
> = {
  site_down: { openAfter: 3, resolveAfter: 5 },
  memory: { openAfter: 5, resolveAfter: 5 },
  disk: { openAfter: 2, resolveAfter: 5 },
  cert_expiring: { openAfter: 1, resolveAfter: 1 },
  backup_failed: { openAfter: 1, resolveAfter: 1 },
  deploy_failed: { openAfter: 1, resolveAfter: 1 },
};

/** One subject's state in this run. `title`/`detail` are Spanish (email and panel), no secret. */
export type Observation = {
  key: string;
  kind: AlertKind;
  project: string | null;
  failing: boolean;
  title: string;
  detail: string;
};

/** The Spanish name of each kind, for the email and the panel. */
export const KIND_LABEL: Record<AlertKind, string> = {
  site_down: "Sitio caído",
  cert_expiring: "Certificado por vencer",
  disk: "Disco",
  memory: "Memoria",
  backup_failed: "Backup",
  deploy_failed: "Despliegue fallido",
};

/** Days left, rounded down; negative once expired. */
export function daysLeft(notAfter: Date, now: number): number {
  return Math.floor((notAfter.getTime() - now) / 86_400_000);
}

export const pct = (used: number, total: number): number =>
  total > 0 ? (used / total) * 100 : 0;
