/**
 * `kit-deploy metrics collect|<project>` (brief F9, D015). `collect` is kit-deploy-metrics.timer's
 * (root, every 30 s): one `metrics.sample` from kit-agent into `metric_samples`. `<project>` only
 * reads the database: it never asks the agent, so it cannot take minutes away from the collector.
 */
import type { MetricsSample } from "../agent/metrics";
import type { Response } from "../agent/protocol";
import { assertProject } from "../lib/core/validate";
import { AdminError } from "../lib/db/admin";
import { collectMetrics } from "../lib/metrics/collect";
import type { ContainerNow, MetricsReader } from "../lib/metrics/read";
import type { LockedMetricsStore } from "../lib/metrics/store";
import type { AgentClient } from "./client";

export type MetricsContext = {
  metrics?: () => { store: LockedMetricsStore; reader: MetricsReader };
  now?: () => number;
};

type Result = { code: number; out: string; err: string };
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export const METRICS_USAGE = `usage:
  kit-deploy metrics <project> [--json]   last reading per container, requests and 5xx in 24 h
  kit-deploy metrics collect [--json]     (root) one sample into the database; the timer's job
`;

const TOTALS_HOURS = 24;

function needMetrics(ctx: MetricsContext) {
  if (!ctx.metrics) throw new AdminError("this command needs the database");
  return ctx.metrics();
}

function agentError(res: Response): string {
  return res.ok ? "" : `kit-agent: ${res.error.code}: ${res.error.message}\n`;
}

/** `12.3 MiB` — the same binary units Docker shows. */
export function humanBytes(n: number | null): string {
  if (n === null) return "-";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return i === 0 ? `${v} B` : `${v.toFixed(1)} ${units[i]}`;
}

const pct = (v: number | null) => (v === null ? "-" : `${v.toFixed(1)}%`);

function columns(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  return `${[header, ...rows]
    .map((cells) =>
      cells
        .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] ?? 0)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")}\n`;
}

function memory(c: ContainerNow): string {
  const share =
    c.memBytes !== null && c.memLimitBytes
      ? ` (${Math.round((c.memBytes / c.memLimitBytes) * 100)}%)`
      : "";
  return `${humanBytes(c.memBytes)} / ${humanBytes(c.memLimitBytes)}${share}`;
}

async function collect(
  client: AgentClient,
  ctx: MetricsContext,
  json: boolean,
): Promise<Result> {
  const { store } = needMetrics(ctx);
  const res = await client.call("metrics.sample", {});
  if (!res.ok) return fail(agentError(res));
  const sample = res.result as MetricsSample;
  const now = ctx.now?.() ?? Date.now();
  const report = await store.locked((s) => collectMetrics(sample, s, now));
  // A part the agent could not read is a warning in the journal, not a failed run: the rest
  // of the sample is stored, and the next one is 30 s away.
  const err = report.errors.map((e) => `warning: ${e}\n`).join("");
  if (json) return { code: 0, out: `${JSON.stringify(report)}\n`, err };
  return {
    code: 0,
    out: `collected ${report.at}: vps ${report.vps ? "yes" : "no"}, ${report.containers} container(s), ${report.requestMinutes} request minute(s) (${report.skippedMinutes} already stored, ${report.unmappedHosts} unknown host(s)), ${report.hoursRolled} hour(s) rolled, pruned ${report.pruned.minutes} + ${report.pruned.hours}\n`,
    err,
  };
}

async function show(
  ctx: MetricsContext,
  rawProject: string,
  json: boolean,
): Promise<Result> {
  const project = assertProject(rawProject);
  const { reader } = needMetrics(ctx);
  const [containers, totals] = await Promise.all([
    reader.containers(project),
    reader.totals(project, TOTALS_HOURS),
  ]);
  if (json) {
    return {
      code: 0,
      out: `${JSON.stringify({ project, containers, last24h: totals })}\n`,
      err: "",
    };
  }
  if (containers.length === 0 && totals.length === 0) {
    return {
      code: 0,
      out: `no metrics for ${project} yet: kit-deploy-metrics.timer collects every 30 s\n`,
      err: "",
    };
  }
  const now = containers.length
    ? columns(
        ["CONTAINER", "ENV", "AT", "CPU", "MEMORY"],
        containers.map((c) => [
          c.name,
          c.env,
          c.at.toISOString().slice(11, 16),
          pct(c.cpuPct),
          memory(c),
        ]),
      )
    : "no container read in the last 5 minutes\n";
  const day = totals.length
    ? columns(
        ["ENV", "REQUESTS 24H", "5XX 24H"],
        totals.map((t) => [t.env, String(t.requests), String(t.requests5xx)]),
      )
    : "no requests in the last 24 h\n";
  return {
    code: 0,
    out: `${now}\n${day}CPU is per core (100% = one core).\n`,
    err: "",
  };
}

export async function metricsCommand(
  client: AgentClient,
  ctx: MetricsContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const [sub, extra] = args;
  if (!sub || extra) return fail(METRICS_USAGE, 2);
  if (sub === "collect") return collect(client, ctx, json);
  return show(ctx, sub, json);
}
