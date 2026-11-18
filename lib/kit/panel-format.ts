/**
 * What the project pages say in words (HANDOFF §2, §3): which StatusBadge a deployment gets, and
 * bytes, durations and percentages in Spanish. Pure, so it is tested without React. Shared by the
 * server pages and the client tables: no Node or DOM imports.
 */
import type { Status } from "@/components/kit/status-badge";
import type { DeploymentStatus } from "@/lib/db/schema";

export type Badge = { status: Status; label?: string };

/** A deployment row's badge: it always shows an icon and a word (never color alone). */
export function deploymentBadge(
  status: DeploymentStatus,
  environment: "production" | "preview",
): Badge {
  switch (status) {
    case "live":
      return { status: environment === "preview" ? "ready" : "active" };
    case "queued":
    case "starting":
      return { status: "building" };
    case "failed":
      return { status: "failed" };
    case "superseded":
      return { status: "saved" };
    case "asleep":
      return { status: "sleeping" };
  }
}

/** The project's production badge: what serves now, or why nothing does. */
export function productionBadge(
  state: DeploymentStatus | "none",
  stopped = false,
): Badge {
  if (state === "none") return { status: "sleeping", label: "Sin despliegues" };
  if (state === "live" && stopped)
    return { status: "sleeping", label: "Detenido" };
  return deploymentBadge(state, "production");
}

const NUMBER = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
const INTEGER = new Intl.NumberFormat("es", { maximumFractionDigits: 0 });

export function formatNumber(n: number): string {
  return NUMBER.format(n);
}

export function formatInteger(n: number): string {
  return INTEGER.format(n);
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "312 MB", "1,2 GB". */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${NUMBER.format(bytes / GB)} GB`;
  return `${INTEGER.format(bytes / MB)} MB`;
}

/** "42 s", "3 min 05 s", "1 h 02 min"; null (still running) → "—". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} s`;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)} min ${pad(seconds % 60)} s`;
  return `${Math.floor(seconds / 3600)} h ${pad(Math.floor((seconds % 3600) / 60))} min`;
}

/** The number of requests, compact: 1.234 → "1,2 k". */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${NUMBER.format(n / 1_000_000)} M`;
  if (n >= 10_000) return `${NUMBER.format(n / 1000)} k`;
  return INTEGER.format(n);
}

/** What a sparkline says, for its accessible name: "CPU, de 2 a 14 % en las últimas 24 h". */
export function seriesSummary(
  label: string,
  values: readonly number[],
  unit: string,
  window = "las últimas 24 h",
): string {
  if (values.length === 0) return `${label}: sin lecturas en ${window}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range =
    min === max
      ? `${NUMBER.format(min)}${unit}`
      : `de ${NUMBER.format(min)} a ${NUMBER.format(max)}${unit}`;
  return `${label}, ${range} en ${window}`;
}

/** `ts` is RFC 3339 UTC: the hour is read off the text so server and browser agree. */
export function logTime(ts: string): string {
  return ts.length >= 19 ? ts.slice(11, 19) : ts;
}
