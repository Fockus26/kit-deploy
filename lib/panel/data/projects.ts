/**
 * Inicio, a project's header and Resumen, Despliegues and Previews (HANDOFF §3), read from
 * kit_deploy, the metrics tables and kit-agent. Pure over PanelDeps (lib/panel/data/index.ts adds
 * the session check and React's per-request cache).
 */

import type { ManagedContainer } from "@/agent/ops";
import { KIND_LABEL } from "@/lib/alerts/rules";
import { PREVIEW_LIMIT } from "@/lib/core/constants";
import { defaultHost, previewHost } from "@/lib/core/target";
import type { DeploymentStatus } from "@/lib/db/schema";
import { siteHosts } from "@/lib/domains/site";
import type { DomainRow } from "@/lib/domains/store";
import type {
  ContainerNow,
  RequestTotals,
  SeriesPoint,
  VpsNow,
} from "@/lib/metrics/read";
import { callAgent } from "@/lib/ops/agent";
import { type PanelDeps, type Unavailable, viaAgent } from "./deps";
import type { DeploymentRow, ProjectRow } from "./store";

/** What the StatusBadge of production shows. `none`: never deployed. */
export type ProductionState = DeploymentStatus | "none";

export type DeploymentItem = {
  id: string;
  environment: "production" | "preview";
  pr: number | null;
  sha: string;
  shortSha: string;
  generation: number;
  status: DeploymentStatus;
  createdAt: Date;
  finishedAt: Date | null;
  /** From queued to live/failed; null while it runs. */
  durationS: number | null;
  /** Why it failed (never a secret: the switch writes it). */
  error: string | null;
  /** "Rollback a este": a kept production build with its container. */
  rollbackable: boolean;
  /** Commit message and author are not stored yet (CONTENT_CHECKLIST row 22). */
  message: null;
  author: null;
};

function item(d: DeploymentRow): DeploymentItem {
  return {
    id: d.id,
    environment: d.environment,
    pr: d.pr,
    sha: d.sha,
    shortSha: d.sha.slice(0, 7),
    generation: d.generation,
    status: d.status,
    createdAt: d.createdAt,
    finishedAt: d.finishedAt,
    durationS:
      d.finishedAt === null
        ? null
        : Math.max(0, Math.round((+d.finishedAt - +d.createdAt) / 1000)),
    error: d.error,
    rollbackable:
      d.environment === "production" &&
      d.status === "superseded" &&
      d.container !== null &&
      d.port !== null,
    message: null,
    author: null,
  };
}

/** The host to show and link: a custom one that serves the site, else `<project>.fockus.dev`. */
export function primaryHost(
  project: string,
  rows: readonly DomainRow[],
): string | null {
  const mine = rows.filter((r) => r.project === project);
  const { hosts } = siteHosts(project, mine);
  const own = defaultHost(project);
  return (
    hosts.find((h) => h !== own) ??
    (own && mine.some((r) => r.host === own) ? own : null) ??
    mine[0]?.host ??
    null
  );
}

/** One on its way shows as deploying; otherwise a live one serves (a newer failed one does not
 * take it down); otherwise the newest's status. */
export function productionState(head?: {
  latest: DeploymentRow | null;
  live: DeploymentRow | null;
}): ProductionState {
  const latest = head?.latest;
  if (!latest) return "none";
  if (latest.status === "queued" || latest.status === "starting")
    return latest.status;
  return head?.live ? "live" : latest.status;
}

// ── Inicio ──

export type HomeProject = {
  name: string;
  repo: string;
  production: ProductionState;
  /** The live one, if any. */
  live: { sha: string; shortSha: string; since: Date } | null;
  domain: string | null;
  lastDeploy: { sha: string; shortSha: string; at: Date } | null;
  /** Production's container against its limit (Meter), from the last metrics reading. */
  memory: { usedBytes: number; limitBytes: number } | null;
};

export type OpenAlert = {
  id: string;
  kind: string;
  /** KIND_LABEL: "Sitio caído", "Certificado por vencer"… */
  kindLabel: string;
  project: string | null;
  title: string;
  detail: string;
  openedAt: Date;
};

export type HomeData = {
  projects: HomeProject[];
  lastDeployAt: Date | null;
  /** Inicio "Estado del servidor": null until the first metrics reading. */
  vps: VpsNow | null;
  /** Inicio "Alertas abiertas" (phase 06, D047), oldest first. */
  alerts: OpenAlert[];
};

export async function readHome(deps: PanelDeps): Promise<HomeData> {
  const [projects, heads, domains, containers, vps, open] = await Promise.all([
    deps.store.projects(),
    deps.store.productionHeads(),
    deps.domains.list(),
    deps.metrics.containers(),
    deps.metrics.vps(),
    deps.alerts.open(),
  ]);
  const out = projects.map((p): HomeProject => {
    const head = heads.get(p.id);
    const live = head?.live ?? null;
    const now = live?.container
      ? containers.find((c) => c.name === live.container)
      : undefined;
    return {
      name: p.name,
      repo: p.repo,
      production: productionState(head),
      live: live
        ? {
            sha: live.sha,
            shortSha: live.sha.slice(0, 7),
            since: live.createdAt,
          }
        : null,
      domain: primaryHost(p.name, domains),
      lastDeploy: head?.latest
        ? {
            sha: head.latest.sha,
            shortSha: head.latest.sha.slice(0, 7),
            at: head.latest.createdAt,
          }
        : null,
      memory:
        now?.memBytes != null && now.memLimitBytes
          ? { usedBytes: now.memBytes, limitBytes: now.memLimitBytes }
          : null,
    };
  });
  const lastDeployAt =
    out
      .map((p) => p.lastDeploy?.at ?? null)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => +b - +a)[0] ?? null;
  const alerts = open.map(
    (a): OpenAlert => ({
      id: a.id,
      kind: a.kind,
      kindLabel: KIND_LABEL[a.kind],
      project: a.project,
      title: a.title,
      detail: a.detail,
      openedAt: a.openedAt,
    }),
  );
  return { projects: out, lastDeployAt, vps, alerts };
}

// ── Proyecto ──

export type ContainerState = {
  name: string;
  /** Docker's: running, exited, created… */
  state: string;
};

export type PreviewItem = {
  pr: number;
  status: DeploymentStatus;
  sha: string;
  shortSha: string;
  host: string;
  url: string;
  lastPushAt: Date;
  /** Not stored (CONTENT_CHECKLIST row 23): the page shows "#<pr>". */
  title: null;
};

export type PreviewsData = {
  previews: PreviewItem[];
  /** Live ones against the limit (D017): "N de 4 encendidos". */
  running: number;
  limit: number;
};

export type ProjectOverview = {
  project: Pick<
    ProjectRow,
    "name" | "repo" | "productionBranch" | "memoryMb" | "createdAt"
  >;
  production: ProductionState;
  live: DeploymentItem | null;
  domain: string | null;
  hosts: string[];
  /** Docker's view of production's container (Parar / Reiniciar), or kit-agent down. */
  container: ContainerState | null | Unavailable;
  canRollback: boolean;
  metrics: {
    containers: ContainerNow[];
    /** Last 24 h of production, oldest first. */
    series: SeriesPoint[];
    totals: RequestTotals[];
  };
  recent: DeploymentItem[];
  previews: PreviewsData;
};

/** Latest deployment of each PR that is not closed (superseded) or failed for good. */
export function previewsOf(
  project: string,
  rows: readonly DeploymentRow[],
): PreviewsData {
  const byPr = new Map<number, DeploymentRow[]>();
  for (const d of rows) {
    if (d.environment !== "preview" || d.pr === null) continue;
    byPr.set(d.pr, [...(byPr.get(d.pr) ?? []), d]);
  }
  const previews: PreviewItem[] = [];
  for (const [pr, ds] of byPr) {
    const sorted = [...ds].sort((a, b) => +b.createdAt - +a.createdAt);
    const newest = sorted[0];
    // What the PR's host serves: the live or asleep one, else what is on its way.
    const shown =
      sorted.find((d) => d.status === "live" || d.status === "asleep") ??
      sorted.find((d) => d.status === "queued" || d.status === "starting") ??
      (newest?.status === "failed" ? newest : undefined);
    if (!shown || !newest) continue;
    const host = previewHost(project, pr);
    previews.push({
      pr,
      status: shown.status,
      sha: shown.sha,
      shortSha: shown.sha.slice(0, 7),
      host,
      url: `https://${host}`,
      lastPushAt: newest.createdAt,
      title: null,
    });
  }
  previews.sort((a, b) => +b.lastPushAt - +a.lastPushAt);
  return {
    previews,
    running: previews.filter((p) => p.status === "live").length,
    limit: PREVIEW_LIMIT,
  };
}

export async function readProjectOverview(
  deps: PanelDeps,
  name: string,
): Promise<ProjectOverview | null> {
  const p = await deps.store.project(name);
  if (!p) return null;
  const [rows, domains, containers, series, totals, docker] = await Promise.all(
    [
      deps.store.deployments(p.id),
      deps.domains.list(p.name),
      deps.metrics.containers(p.name),
      deps.metrics.series(p.name, "production", 24),
      deps.metrics.totals(p.name, 24),
      viaAgent(
        async () =>
          (await callAgent(deps.agent, "container.list", {
            project: p.name,
          })) as ManagedContainer[],
      ),
    ],
  );
  const production = rows.filter((d) => d.environment === "production");
  const liveRow = production.find((d) => d.status === "live") ?? null;
  const live = liveRow ? item(liveRow) : null;
  const container: ProjectOverview["container"] = Array.isArray(docker)
    ? liveRow?.container
      ? (() => {
          const c = docker.find((x) => x.name === liveRow.container);
          return { name: liveRow.container, state: c?.state ?? "missing" };
        })()
      : null
    : docker;
  return {
    project: {
      name: p.name,
      repo: p.repo,
      productionBranch: p.productionBranch,
      memoryMb: p.memoryMb,
      createdAt: p.createdAt,
    },
    production: productionState({
      latest: production[0] ?? null,
      live: liveRow,
    }),
    live,
    domain: primaryHost(p.name, domains),
    hosts: domains.map((d) => d.host),
    container,
    canRollback: production.some(
      (d) =>
        item(d).rollbackable && (!liveRow || d.createdAt < liveRow.createdAt),
    ),
    metrics: {
      containers: containers.filter((c) => c.env === "production"),
      series,
      totals,
    },
    recent: rows.slice(0, 5).map(item),
    previews: previewsOf(p.name, rows),
  };
}

// ── Despliegues / Previews ──

export type DeploymentsData = {
  deployments: DeploymentItem[];
  /** How many there are of each environment in what was read (EnvTabs). */
  counts: { production: number; preview: number };
};

export async function readDeployments(
  deps: PanelDeps,
  name: string,
  filter: { environment?: "production" | "preview"; status?: DeploymentStatus },
): Promise<DeploymentsData | null> {
  const p = await deps.store.project(name);
  if (!p) return null;
  const all = await deps.store.deployments(p.id);
  const shown = all.filter(
    (d) =>
      (!filter.environment || d.environment === filter.environment) &&
      (!filter.status || d.status === filter.status),
  );
  return {
    deployments: shown.map(item),
    counts: {
      production: all.filter((d) => d.environment === "production").length,
      preview: all.filter((d) => d.environment === "preview").length,
    },
  };
}

export type DeploymentDetail = DeploymentItem & {
  image: string;
  container: string | null;
  port: number | null;
  /** /api/health of a live one right now; null when it has no running container. */
  health: { ok: boolean; status: number | null } | null | Unavailable;
};

export async function readDeployment(
  deps: PanelDeps,
  name: string,
  id: string,
): Promise<DeploymentDetail | null> {
  const p = await deps.store.project(name);
  if (!p) return null;
  const d = await deps.store.deployment(p.id, id);
  if (!d) return null;
  const port = d.port;
  const health =
    d.status === "live" && port !== null
      ? await viaAgent(
          async () =>
            (await callAgent(deps.agent, "health.check", { port })) as {
              ok: boolean;
              status: number | null;
            },
        )
      : null;
  return {
    ...item(d),
    image: d.image,
    container: d.container,
    port: d.port,
    health,
  };
}

export async function readPreviews(
  deps: PanelDeps,
  name: string,
): Promise<PreviewsData | null> {
  const p = await deps.store.project(name);
  if (!p) return null;
  return previewsOf(
    p.name,
    await deps.store.deployments(p.id, { environment: "preview" }),
  );
}
