/**
 * `kit-deploy cron …` (phase 06, brief F12, D048): a project's scheduled routes and their runs.
 * `tick` is kit-deploy-cron.timer's (root, every minute). The route gets
 * `Authorization: Bearer <CRON_SECRET>` from kit-agent; the value is never read here.
 */

import { assertProject } from "../lib/core/validate";
import { type CronJob, type CronRun, tick } from "../lib/cron/run";
import {
  CRON_PATH_RE,
  nextRun,
  parseSchedule,
  ScheduleError,
} from "../lib/cron/schedule";
import type { CronAdmin } from "../lib/cron/store";
import { AdminError } from "../lib/db/admin";
import type { AuditEntry } from "../lib/db/audit";
import type { AgentClient } from "./client";

export type CronContext = {
  cron?: () => CronAdmin;
  actor?: string;
  now?: () => number;
};

type Result = { code: number; out: string; err: string };
const ok = (out: string, err = ""): Result => ({ code: 0, out, err });
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export const CRON_USAGE = `usage:
  kit-deploy cron ls <project> [--json]       its jobs: id, schedule (UTC), path, next run
  kit-deploy cron add <project> <path> "<m h dom mon dow>"
                     GET <path> on production on that schedule (UTC), with
                     Authorization: Bearer <CRON_SECRET> (env set <project> production CRON_SECRET)
  kit-deploy cron rm <project> <id>
  kit-deploy cron pause|resume <project> <id>
  kit-deploy cron run <project> <id>          call it now (logged like a scheduled run)
  kit-deploy cron runs <project> [--job <id>] [-n <count>] [--json]
                     the last runs (30 days kept): when, status, HTTP code, duration
  kit-deploy cron tick                        (root) this minute's jobs; kit-deploy-cron.timer's
`;

function need(ctx: CronContext): CronAdmin {
  if (!ctx.cron) throw new AdminError("this command needs the database");
  return ctx.cron();
}

const short = (id: string) => id.slice(0, 8);
const stamp = (d: Date | null) =>
  d ? d.toISOString().slice(0, 16).replace("T", " ") : "-";

function columns(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  return `${[header, ...rows]
    .map((r) =>
      r
        .map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i] ?? 0)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")}\n`;
}

/** A job by its id or a prefix of 6+ characters (what `cron ls` shows is 8). */
async function findJob(
  store: CronAdmin,
  project: string,
  id: string | undefined,
): Promise<CronJob> {
  if (!id || !/^[0-9a-f-]{6,36}$/.test(id))
    throw new AdminError(
      "give the job's id (from kit-deploy cron ls <project>)",
    );
  const hits = (await store.jobs(project)).filter((j) => j.id.startsWith(id));
  if (hits.length === 0)
    throw new AdminError(`${project} has no cron job ${id}`);
  if (hits.length > 1)
    throw new AdminError(`${id} matches more than one job: give more of it`);
  return hits[0] as CronJob;
}

function next(job: CronJob, now: number): string {
  if (!job.enabled) return "paused";
  try {
    return stamp(nextRun(parseSchedule(job.schedule), new Date(now)));
  } catch {
    return "invalid schedule";
  }
}

function audit(
  ctx: CronContext,
  action: AuditEntry["action"],
  project: string,
  name: string,
): AuditEntry {
  return {
    actor: ctx.actor ?? "ssh:unknown",
    action,
    project,
    environment: "production",
    name,
  };
}

function runRows(runs: CronRun[]): string {
  return columns(
    ["STARTED", "PATH", "STATUS", "HTTP", "MS", "ERROR"],
    runs.map((r) => [
      stamp(r.startedAt),
      r.path,
      r.status,
      r.httpStatus === null ? "-" : String(r.httpStatus),
      r.durationMs === null ? "-" : String(r.durationMs),
      r.error ?? "",
    ]),
  );
}

export async function cronCommand(
  client: AgentClient,
  ctx: CronContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const [sub, rawProject, ...rest] = args;
  const now = (ctx.now ?? Date.now)();
  if (sub === "tick") {
    const store = need(ctx);
    const r = await tick({ store, agent: client, now: ctx.now ?? Date.now });
    if (json) return ok(`${JSON.stringify(r)}\n`);
    const lines = r.lines.map(
      (l) =>
        `${l.status} ${l.project} ${l.path}${l.httpStatus === null ? "" : ` ${l.httpStatus}`}${l.durationMs === null ? "" : ` ${l.durationMs}ms`}${l.error ? ` (${l.error})` : ""}`,
    );
    return ok(
      lines.length ? `${lines.join("\n")}\n` : "",
      r.skipped.map((s) => `warning: skipped ${s}\n`).join(""),
    );
  }
  if (!sub || !rawProject) return fail(CRON_USAGE, 2);
  const project = assertProject(rawProject);
  const store = need(ctx);

  switch (sub) {
    case "ls": {
      const jobs = await store.jobs(project);
      if (json) return ok(`${JSON.stringify(jobs)}\n`);
      if (jobs.length === 0) return ok(`no cron jobs for ${project}\n`);
      return ok(
        columns(
          ["ID", "SCHEDULE (UTC)", "NEXT", "PATH"],
          jobs.map((j) => [short(j.id), j.schedule, next(j, now), j.path]),
        ),
      );
    }
    case "add": {
      const [path, ...scheduleParts] = rest;
      const schedule = scheduleParts.join(" ").trim().replace(/\s+/g, " ");
      if (!path || !schedule) return fail(CRON_USAGE, 2);
      if (!CRON_PATH_RE.test(path))
        return fail(
          `invalid path "${path}": absolute, letters, digits and ._~/- only, no query\n`,
          2,
        );
      try {
        parseSchedule(schedule);
      } catch (e) {
        if (e instanceof ScheduleError)
          return fail(`invalid schedule: ${e.message}\n`, 2);
        throw e;
      }
      const job = await store.add(
        project,
        path,
        schedule,
        audit(ctx, "cron.add", project, `${path} ${schedule}`),
      );
      const secret = await store.cronSecret(project);
      return ok(
        `added ${short(job.id)}: GET ${path} on "${schedule}" (UTC), next ${next(job, now)}\n`,
        secret
          ? ""
          : `warning: ${project} has no CRON_SECRET in production; its runs fail until:\n  ssh -t kit-vps kit-deploy env set ${project} production CRON_SECRET\n`,
      );
    }
    case "rm": {
      const job = await findJob(store, project, rest[0]);
      await store.remove(
        project,
        job.id,
        audit(ctx, "cron.remove", project, `${job.path} ${job.schedule}`),
      );
      return ok(`removed ${short(job.id)} (${job.path})\n`);
    }
    case "pause":
    case "resume": {
      const job = await findJob(store, project, rest[0]);
      const enabled = sub === "resume";
      await store.setEnabled(
        project,
        job.id,
        enabled,
        audit(
          ctx,
          enabled ? "cron.enable" : "cron.disable",
          project,
          `${job.path} ${job.schedule}`,
        ),
      );
      return ok(
        `${enabled ? "resumed" : "paused"} ${short(job.id)} (${job.path})\n`,
      );
    }
    case "run": {
      const job = await findJob(store, project, rest[0]);
      // Its own slot (this exact moment, not the minute): never collides with a scheduled run.
      const r = await tick({
        store: {
          ...store,
          jobs: async () => [{ ...job, enabled: true, schedule: "* * * * *" }],
        },
        agent: client,
        now: () => (ctx.now ?? Date.now)(),
        slot: new Date(now),
      });
      const l = r.lines[0];
      if (!l)
        return fail("another run of this job holds this moment; try again\n");
      if (json) return ok(`${JSON.stringify(l)}\n`);
      return {
        code: l.status === "ok" ? 0 : 1,
        out: `${l.status} ${l.path}${l.httpStatus === null ? "" : ` ${l.httpStatus}`}${l.durationMs === null ? "" : ` ${l.durationMs}ms`}\n`,
        err: l.error ? `${l.error}\n` : "",
      };
    }
    case "runs": {
      const j = rest.indexOf("--job");
      const n = rest.indexOf("-n");
      const limit = n >= 0 ? Number(rest[n + 1]) : 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        return fail("-n takes 1 to 500\n", 2);
      const jobId =
        j >= 0 ? (await findJob(store, project, rest[j + 1])).id : undefined;
      const runs = await store.runs(project, limit, jobId);
      if (json) return ok(`${JSON.stringify(runs)}\n`);
      if (runs.length === 0) return ok(`no runs yet for ${project}\n`);
      return ok(runRows(runs));
    }
    default:
      return fail(CRON_USAGE, 2);
  }
}
