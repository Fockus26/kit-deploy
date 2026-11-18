/**
 * Cron per project (phase 06, brief F12, D048): `kit-deploy cron tick` (root, every minute by
 * kit-deploy-cron.timer) runs each enabled job whose schedule matches this UTC minute: one
 * `cron_runs` row claims the minute (a second tick cannot run it twice), kit-agent's `cron.call`
 * GETs the production route with the project's CRON_SECRET (opened only inside the agent), and the
 * row gets the HTTP status and duration. Jobs of one minute run side by side. A minute missed while
 * the VPS was down is not caught up (like Vercel Cron). Behind `CronStore` to test without Postgres.
 */
import type { AgentClient } from "../../cli/client";
import type { Sealed } from "../core/crypto";
import type { CronRunStatus } from "../db/schema";
import { matches, parseSchedule, ScheduleError } from "./schedule";

export type CronJob = {
  id: string;
  project: string;
  path: string;
  schedule: string;
  enabled: boolean;
  createdAt: Date;
};

export type CronRun = {
  id: string;
  jobId: string;
  project: string;
  path: string;
  scheduledFor: Date;
  startedAt: Date;
  finishedAt: Date | null;
  status: CronRunStatus;
  httpStatus: number | null;
  durationMs: number | null;
  error: string | null;
};

export type StoredSecret = { name: string; secret: boolean; sealed: Sealed };

export interface CronStore {
  /** Every job, or one project's (AdminError for an unknown project); by project, path. */
  jobs(project?: string): Promise<CronJob[]>;
  /** The job's runs (or the project's), newest first. */
  runs(project: string, limit: number, jobId?: string): Promise<CronRun[]>;
  /** The minute's row; null when another tick already took it. */
  claim(jobId: string, scheduledFor: Date, now: Date): Promise<string | null>;
  finish(
    runId: string,
    r: Pick<CronRun, "status" | "httpStatus" | "durationMs" | "error">,
    now: Date,
  ): Promise<void>;
  /** The live production container's port, or null. */
  livePort(project: string): Promise<number | null>;
  /** Production's stored CRON_SECRET row, or null when it is not set. */
  cronSecret(project: string): Promise<StoredSecret | null>;
  pruneRuns(before: Date): Promise<void>;
}

/** 30 days of runs (brief F12: "a log of each run"). */
export const RUNS_KEPT_MS = 30 * 86_400_000;

export type TickLine = {
  project: string;
  path: string;
  status: CronRunStatus;
  httpStatus: number | null;
  durationMs: number | null;
  error: string | null;
};

/** The minute `at` belongs to. */
export function minuteOf(at: number): Date {
  return new Date(Math.floor(at / 60_000) * 60_000);
}

async function runOne(
  store: CronStore,
  agent: AgentClient,
  job: CronJob,
  slot: Date,
  now: () => Date,
): Promise<TickLine | null> {
  const runId = await store.claim(job.id, slot, now());
  if (!runId) return null;
  let line: Omit<TickLine, "project" | "path">;
  const port = await store.livePort(job.project);
  const secret = port === null ? null : await store.cronSecret(job.project);
  if (port === null) {
    line = {
      status: "failed",
      httpStatus: null,
      durationMs: null,
      error: "no live production container",
    };
  } else if (!secret) {
    line = {
      status: "failed",
      httpStatus: null,
      durationMs: null,
      error:
        "CRON_SECRET is not set in production (kit-deploy env set <project> production CRON_SECRET)",
    };
  } else {
    const res = await agent.call("cron.call", {
      project: job.project,
      port,
      path: job.path,
      secret,
    });
    if (!res.ok) {
      line = {
        status: "failed",
        httpStatus: null,
        durationMs: null,
        error: `kit-agent: ${res.error.code}: ${res.error.message}`,
      };
    } else {
      const r = res.result as {
        status: number | null;
        durationMs: number;
        error?: string;
      };
      const ok = r.status !== null && r.status >= 200 && r.status < 300;
      line = {
        status: ok ? "ok" : "failed",
        httpStatus: r.status,
        durationMs: r.durationMs,
        error: ok ? null : (r.error ?? `HTTP ${r.status}`),
      };
    }
  }
  await store.finish(runId, line, now());
  return { project: job.project, path: job.path, ...line };
}

export async function tick(deps: {
  store: CronStore;
  agent: AgentClient;
  now: () => number;
  /** `cron run`: this moment instead of the minute, so it never takes a scheduled run's slot. */
  slot?: Date;
}): Promise<{ lines: TickLine[]; skipped: string[] }> {
  const startedAt = deps.now();
  const slot = deps.slot ?? minuteOf(startedAt);
  const skipped: string[] = [];
  const due: CronJob[] = [];
  for (const job of await deps.store.jobs()) {
    if (!job.enabled) continue;
    try {
      if (matches(parseSchedule(job.schedule), slot)) due.push(job);
    } catch (e) {
      if (!(e instanceof ScheduleError)) throw e;
      skipped.push(`${job.project} ${job.path}: ${e.message}`);
    }
  }
  const now = () => new Date(deps.now());
  const lines = (
    await Promise.all(
      due.map((j) => runOne(deps.store, deps.agent, j, slot, now)),
    )
  ).filter((l): l is TickLine => l !== null);
  await deps.store.pruneRuns(new Date(startedAt - RUNS_KEPT_MS));
  return { lines, skipped };
}
