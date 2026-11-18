/**
 * What `kit-deploy alerts check` looks at each minute (brief F10): every production site's
 * /api/health, the certificates (project domains and the platform's), the VPS disk and memory
 * (the metrics collector's last reading), kit-db's backups and each project's last production
 * deployment. Each check returns observations for every subject it saw — failing or fine — and
 * says whether it ran to the end; one that could not (agent unreachable) leaves its alerts alone.
 */
import type { BackupsStatus } from "../../agent/databases";
import type { PlatformCert } from "../../agent/domains";
import type { ManagedContainer } from "../../agent/ops";
import type { AgentClient } from "../../cli/client";
import type { AlertKind } from "../db/schema";
import type { VpsNow } from "../metrics/read";
import { callAgent } from "../ops/agent";
import {
  BACKUP_MAX_AGE_HOURS,
  CERT_WARN_DAYS,
  DEPLOY_FAILED_WINDOW_DAYS,
  DISK_PCT,
  daysLeft,
  MEMORY_PCT,
  type Observation,
  pct,
  VPS_SAMPLE_MAX_AGE_MS,
} from "./rules";

export type LiveSite = {
  project: string;
  container: string;
  port: number;
  /** The panel's Parar was the last word on it (audit_log): a stopped container is not down. */
  stoppedOnPurpose: boolean;
};

export type LastDeploy = {
  project: string;
  status: string;
  sha: string;
  error: string | null;
  createdAt: Date;
};

export interface CheckRepo {
  liveSites(): Promise<LiveSite[]>;
  domainCerts(): Promise<
    {
      project: string;
      host: string;
      certNotAfter: Date | null;
      status: string;
    }[]
  >;
  /** Each project's newest production deployment. */
  lastProductionDeploys(): Promise<LastDeploy[]>;
  vps(): Promise<VpsNow | null>;
}

export type CheckDeps = { agent: AgentClient; repo: CheckRepo; now: number };

export type CheckResult = {
  observations: Observation[];
  covered: Set<AlertKind>;
  /** A check that could not run, in English for the journal. */
  problems: string[];
};

const day = (d: Date) => d.toISOString().slice(0, 10);

async function sites(deps: CheckDeps): Promise<Observation[]> {
  const live = await deps.repo.liveSites();
  const containers = (await callAgent(
    deps.agent,
    "container.list",
    {},
  )) as ManagedContainer[];
  const state = new Map(containers.map((c) => [c.name, c.state]));
  const out: Observation[] = [];
  for (const s of live) {
    const running = state.get(s.container) === "running";
    if (!running && s.stoppedOnPurpose) continue;
    let failing = !running;
    let detail = running
      ? ""
      : `El contenedor ${s.container} no está en marcha.`;
    if (running) {
      const h = (await callAgent(deps.agent, "health.check", {
        port: s.port,
      })) as { ok: boolean; status: number | null };
      failing = !h.ok;
      detail = h.ok
        ? ""
        : h.status === null
          ? "/api/health no respondió en 5 s."
          : `/api/health respondió ${h.status}.`;
    }
    out.push({
      key: `site_down:${s.project}`,
      kind: "site_down",
      project: s.project,
      failing,
      title: `${s.project} no responde`,
      detail,
    });
  }
  return out;
}

function certObservation(
  name: string,
  project: string | null,
  notAfter: Date,
  now: number,
): Observation {
  const left = daysLeft(notAfter, now);
  return {
    key: `cert:${name}`,
    kind: "cert_expiring",
    project,
    failing: left < CERT_WARN_DAYS,
    title:
      left < 0
        ? `El certificado de ${name} venció`
        : `El certificado de ${name} vence en ${left} ${left === 1 ? "día" : "días"}`,
    detail: `Vence el ${day(notAfter)}.`,
  };
}

async function certs(deps: CheckDeps): Promise<Observation[]> {
  const out: Observation[] = [];
  for (const d of await deps.repo.domainCerts()) {
    // Only a certificate Caddy already holds: pending_dns/issuing hosts have none yet.
    if (d.certNotAfter)
      out.push(certObservation(d.host, d.project, d.certNotAfter, deps.now));
  }
  const platform = (await callAgent(
    deps.agent,
    "platform.certs",
    {},
  )) as PlatformCert[];
  for (const c of platform) {
    if (c.notAfter)
      out.push(certObservation(c.name, null, new Date(c.notAfter), deps.now));
  }
  return out;
}

function machine(vps: VpsNow | null, now: number): Observation[] {
  // Not covered (a throw), so an open disk/memory alert is not resolved by a missing reading.
  if (!vps || now - vps.at.getTime() > VPS_SAMPLE_MAX_AGE_MS)
    throw new Error("no VPS reading in the last 5 minutes");
  const out: Observation[] = [];
  if (vps.diskUsed !== null && vps.diskTotal) {
    const p = pct(vps.diskUsed, vps.diskTotal);
    out.push({
      key: "disk",
      kind: "disk",
      project: null,
      failing: p > DISK_PCT,
      title: `Disco del VPS al ${Math.round(p)} %`,
      detail: `Umbral: ${DISK_PCT} %.`,
    });
  }
  if (vps.memUsed !== null && vps.memTotal) {
    const p = pct(vps.memUsed, vps.memTotal);
    out.push({
      key: "memory",
      kind: "memory",
      project: null,
      failing: p > MEMORY_PCT,
      title: `Memoria del VPS al ${Math.round(p)} %`,
      detail: `Umbral: ${MEMORY_PCT} % durante 5 minutos.`,
    });
  }
  return out;
}

async function backups(deps: CheckDeps): Promise<Observation[]> {
  const s = (await callAgent(
    deps.agent,
    "backups.status",
    {},
  )) as BackupsStatus;
  const out: Observation[] = [];
  for (const db of s.databases) {
    const last = db.lastBackupAt ? Date.parse(db.lastBackupAt) : null;
    // A failure newer than the newest dump is a backup that has not succeeded since.
    const failure = s.failures
      .filter(
        (f) =>
          f.db === db.name &&
          f.at !== null &&
          (last === null || Date.parse(f.at) > last),
      )
      .at(-1);
    const stale =
      last !== null && deps.now - last > BACKUP_MAX_AGE_HOURS * 3_600_000;
    const failing = failure !== undefined || stale;
    out.push({
      key: `backup:${db.name}`,
      kind: "backup_failed",
      project: null,
      failing,
      title: `Falló el backup de ${db.name}`,
      detail: failure
        ? `kit-db: ${failure.why}`
        : stale && db.lastBackupAt
          ? `El último backup es del ${day(new Date(db.lastBackupAt))}.`
          : "",
    });
  }
  return out;
}

function deploys(rows: LastDeploy[], now: number): Observation[] {
  return rows.map((d) => {
    const failing =
      d.status === "failed" &&
      now - d.createdAt.getTime() < DEPLOY_FAILED_WINDOW_DAYS * 86_400_000;
    return {
      key: `deploy_failed:${d.project}`,
      kind: "deploy_failed",
      project: d.project,
      failing,
      title: `Falló el despliegue de ${d.project}`,
      detail: failing
        ? `Commit ${d.sha.slice(0, 12)}: ${d.error ?? "sin detalle"}. Producción sigue en el anterior.`
        : "",
    };
  });
}

/** Every check; each one's failure is a problem line, never the whole run's. */
export async function runChecks(deps: CheckDeps): Promise<CheckResult> {
  const result: CheckResult = {
    observations: [],
    covered: new Set(),
    problems: [],
  };
  const steps: [AlertKind[], string, () => Promise<Observation[]>][] = [
    [["site_down"], "health", () => sites(deps)],
    [["cert_expiring"], "certificates", () => certs(deps)],
    [
      ["disk", "memory"],
      "vps",
      async () => machine(await deps.repo.vps(), deps.now),
    ],
    [["backup_failed"], "backups", () => backups(deps)],
    [
      ["deploy_failed"],
      "deploys",
      async () => deploys(await deps.repo.lastProductionDeploys(), deps.now),
    ],
  ];
  for (const [kinds, name, run] of steps) {
    try {
      result.observations.push(...(await run()));
      for (const k of kinds) result.covered.add(k);
    } catch (e) {
      result.problems.push(`${name}: ${(e as Error).message}`);
    }
  }
  return result;
}
