/**
 * `kit-deploy` commands. Pure over an `AgentClient`: they return what to print and the exit code,
 * so they are tested without a socket. Output is English and plain (agents parse it); `--json`
 * prints the data as-is.
 *
 * deploy, rollback and regenerate also need the database (D012: Caddy files and containers are
 * generated from it); they get it through `CliContext.deploy`, opened only when used.
 */

import type { ManagedContainer } from "../agent/ops";
import type { Response } from "../agent/protocol";
import { imageFor } from "../lib/api/deploy";
import type { DeployStore } from "../lib/db/store";
import {
  processProject,
  regenerate,
  rollback,
  type SwitchDeps,
  SwitchError,
} from "../lib/deploy/switch";
import pkg from "../package.json";
import { type AgentClient, AgentUnreachable } from "./client";

/** What the database-backed commands need; built lazily so `version` works without a database. */
export type DeployContext = { switch: SwitchDeps; store: DeployStore };
export type CliContext = {
  deploy?: () => DeployContext;
  now?: () => number;
};

export const CLI_VERSION: string = pkg.version;

export type Result = { code: number; out: string; err: string };

const ok = (out: string): Result => ({ code: 0, out, err: "" });
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export const USAGE = `kit-deploy ${CLI_VERSION}

Usage: kit-deploy <command> [args] [--json]

Commands:
  version            CLI and kit-agent versions
  list               every site: environment, state, commit, port, kept deployments
  status <project>   a project's containers and the health of the running ones
  deploy <project> [<sha>]
                     queue that commit (40 hex) if given, then run the project's switch
  rollback <project> back to the previous kept deployment (no build, no pull)
  regenerate         rewrite every live site's Caddy file; start its container if stopped
  help               this text
`;

function describe(res: Response): string {
  return res.ok ? "" : `${res.error.code}: ${res.error.message}`;
}

/** Fixed-width columns, no colours (agents and pipes read it). */
export function table(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] ?? 0)))
      .join("  ")
      .trimEnd();
  return `${[line(header), ...rows.map(line)].join("\n")}\n`;
}

async function containers(
  client: AgentClient,
  project?: string,
): Promise<ManagedContainer[] | Result> {
  const res = await client.call("container.list", project ? { project } : {});
  if (!res.ok) return fail(`${describe(res)}\n`);
  return res.result as ManagedContainer[];
}

export type SiteSummary = {
  site: string;
  project: string;
  env: string;
  state: string;
  sha: string;
  port: number | null;
  kept: number;
};

/** One row per site: its running container if any (else the newest one), plus how many it keeps. */
export function summarize(list: ManagedContainer[]): SiteSummary[] {
  const bySite = new Map<string, ManagedContainer[]>();
  for (const c of list) bySite.set(c.site, [...(bySite.get(c.site) ?? []), c]);
  return [...bySite.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([site, cs]) => {
      const live = cs.find((c) => c.state === "running") ?? cs[0];
      return {
        site,
        project: live?.project ?? "",
        env: live?.env ?? "",
        state: live?.state ?? "",
        sha: (live?.sha ?? "").slice(0, 12),
        port: live?.port ?? null,
        kept: cs.length,
      };
    });
}

async function version(client: AgentClient, json: boolean): Promise<Result> {
  let agent: string | null = null;
  let problem = "";
  try {
    const res = await client.call("version", {});
    if (res.ok) agent = (res.result as { version: string }).version;
    else problem = describe(res);
  } catch (e) {
    problem = (e as Error).message;
  }
  if (json) {
    return {
      code: agent ? 0 : 1,
      out: `${JSON.stringify({ cli: CLI_VERSION, agent })}\n`,
      err: problem && `${problem}\n`,
    };
  }
  const out = `kit-deploy ${CLI_VERSION}\nkit-agent ${agent ?? "unreachable"}\n`;
  return { code: agent ? 0 : 1, out, err: problem && `${problem}\n` };
}

async function list(client: AgentClient, json: boolean): Promise<Result> {
  const cs = await containers(client);
  if (!Array.isArray(cs)) return cs;
  const sites = summarize(cs);
  if (json) return ok(`${JSON.stringify(sites)}\n`);
  if (sites.length === 0) return ok("no sites yet\n");
  return ok(
    table(
      ["SITE", "ENV", "STATE", "SHA", "PORT", "KEPT"],
      sites.map((s) => [
        s.site,
        s.env,
        s.state,
        s.sha,
        String(s.port ?? "-"),
        String(s.kept),
      ]),
    ),
  );
}

const PROJECT = /^[a-z0-9][a-z0-9_]{0,39}$/;

async function status(
  client: AgentClient,
  project: string | undefined,
  json: boolean,
): Promise<Result> {
  if (!project) return fail("usage: kit-deploy status <project>\n", 2);
  if (!PROJECT.test(project))
    return fail(`invalid project name "${project}"\n`, 2);
  const cs = await containers(client, project);
  if (!Array.isArray(cs)) return cs;

  const rows = await Promise.all(
    cs.map(async (c) => {
      let health = "-";
      if (c.state === "running" && c.port) {
        const res = await client.call("health.check", { port: c.port });
        if (res.ok) {
          const h = res.result as { ok: boolean; status: number | null };
          health = `${h.ok ? "ok" : "down"} (${h.status ?? "no answer"})`;
        } else health = `unknown (${res.error.code})`;
      }
      return { ...c, health };
    }),
  );
  if (json) return ok(`${JSON.stringify(rows)}\n`);
  if (rows.length === 0) return ok(`no deployments for ${project}\n`);
  return ok(
    table(
      ["CONTAINER", "ENV", "STATE", "PORT", "HEALTH"],
      rows.map((r) => [
        r.name,
        r.env,
        r.state,
        String(r.port ?? "-"),
        r.health,
      ]),
    ),
  );
}

const SHA = /^[0-9a-f]{40}$/;

function needDeploy(ctx: CliContext): DeployContext {
  if (!ctx.deploy) throw new SwitchError("this command needs the database");
  return ctx.deploy();
}

async function deploy(
  ctx: CliContext,
  project: string | undefined,
  sha: string | undefined,
  json: boolean,
): Promise<Result> {
  if (!project) return fail("usage: kit-deploy deploy <project> [<sha>]\n", 2);
  if (!PROJECT.test(project))
    return fail(`invalid project name "${project}"\n`, 2);
  if (sha !== undefined && !SHA.test(sha)) {
    return fail(
      `invalid commit "${sha}": expected 40 lowercase hex chars\n`,
      2,
    );
  }
  const d = needDeploy(ctx);
  const p = await d.switch.repo.projectByName(project);
  if (!p) return fail(`no project ${project}\n`);

  const lines: string[] = [];
  if (sha) {
    const open = await d.store.findOpenDeployment(p.id, sha);
    if (open)
      lines.push(`already ${open.status}: ${open.id} (${sha.slice(0, 12)})`);
    else {
      const created = await d.store.createDeployment({
        projectId: p.id,
        environment: "production",
        sha,
        image: imageFor(p.repo, sha),
      });
      lines.push(
        created
          ? `queued ${created.id} (${sha.slice(0, 12)})`
          : "queued by someone else",
      );
    }
  }
  const results = await processProject(d.switch, p.id);
  const code = results.some((r) => r.result === "failed") ? 1 : 0;
  if (json) return { code, out: `${JSON.stringify(results)}\n`, err: "" };
  if (results.length === 0) lines.push(`nothing queued for ${project}`);
  for (const r of results) {
    lines.push(
      r.result === "live" ? `live ${r.id}` : `failed ${r.id}: ${r.error}`,
    );
  }
  return { code, out: `${lines.join("\n")}\n`, err: "" };
}

async function doRollback(
  ctx: CliContext,
  project: string | undefined,
  json: boolean,
): Promise<Result> {
  if (!project) return fail("usage: kit-deploy rollback <project>\n", 2);
  if (!PROJECT.test(project))
    return fail(`invalid project name "${project}"\n`, 2);
  const now = ctx.now ?? Date.now;
  const t0 = now();
  const r = await rollback(needDeploy(ctx).switch, project);
  const seconds = ((now() - t0) / 1000).toFixed(1);
  if (json)
    return ok(`${JSON.stringify({ ...r, seconds: Number(seconds) })}\n`);
  return ok(
    `rolled back ${project}: ${r.from ?? "-"} -> ${r.to} in ${seconds}s\n`,
  );
}

async function doRegenerate(ctx: CliContext, json: boolean): Promise<Result> {
  const results = await regenerate(needDeploy(ctx).switch);
  const code = results.some((r) => !r.ok) ? 1 : 0;
  if (json) return { code, out: `${JSON.stringify(results)}\n`, err: "" };
  if (results.length === 0) return ok("no live sites\n");
  const out = results
    .map((r) => (r.ok ? `ok ${r.project}` : `failed ${r.project}: ${r.error}`))
    .join("\n");
  return { code, out: `${out}\n`, err: "" };
}

export async function runCli(
  argv: string[],
  client: AgentClient,
  ctx: CliContext = {},
): Promise<Result> {
  const json = argv.includes("--json");
  const [cmd, ...args] = argv.filter((a) => a !== "--json");
  try {
    switch (cmd) {
      case "version":
      case "--version":
        return await version(client, json);
      case "list":
        return await list(client, json);
      case "status":
        return await status(client, args[0], json);
      case "deploy":
        return await deploy(ctx, args[0], args[1], json);
      case "rollback":
        return await doRollback(ctx, args[0], json);
      case "regenerate":
        return await doRegenerate(ctx, json);
      case undefined:
      case "help":
      case "--help":
      case "-h":
        return ok(USAGE);
      default:
        return {
          code: 2,
          out: "",
          err: `unknown command "${cmd}"\n\n${USAGE}`,
        };
    }
  } catch (e) {
    if (e instanceof AgentUnreachable || e instanceof SwitchError) {
      return fail(`${e.message}\n`);
    }
    // DATABASE_URL missing or the database down: the reason, never a stack.
    if (
      e instanceof Error &&
      /DATABASE_URL|ECONNREFUSED|password authentication/.test(e.message)
    ) {
      return fail(`database: ${e.message}\n`);
    }
    throw e;
  }
}
