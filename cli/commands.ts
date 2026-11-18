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
import {
  ENROL_LINK_TTL_MS,
  enrolmentLink,
  generateEnrolmentToken,
} from "../lib/auth/enrolment";
import { defaultHost, MEMORY_MB } from "../lib/core";
import { DASHBOARD_HOST } from "../lib/core/constants";
import { pinFor } from "../lib/core/image-pin";
import { CoreInputError } from "../lib/core/validate";
import { AdminError, type AdminStore } from "../lib/db/admin";
import type { DeployStore } from "../lib/db/store";
import type { UserStore } from "../lib/db/users";
import type { GitHubRequest } from "../lib/deploy/github";
import { type SweepDeps, sweepPreviews } from "../lib/deploy/sweep";
import {
  processProject,
  regenerate,
  rollback,
  type SwitchDeps,
  SwitchError,
} from "../lib/deploy/switch";
import { AgentRefused, OpsError } from "../lib/ops/agent";
import {
  createDatabases,
  queueRedeploy,
  startRebuild,
} from "../lib/ops/deploy";
import {
  addProject,
  createDeployToken,
  DEFAULT_MEMORY_MB,
  REPO_RE,
} from "../lib/ops/projects";
import pkg from "../package.json";
import { type AgentClient, AgentUnreachable } from "./client";
import { DB_USAGE, dbStatusCommand } from "./db-commands";
import { type DomainContext, domainCommand } from "./domain-commands";
import { type EnvContext, envCommand } from "./env-commands";
import { type LogsContext, logsCommand } from "./logs-commands";
import { type MetricsContext, metricsCommand } from "./metrics-commands";

/** What the database-backed commands need; built lazily so `version` works without a database. */
export type DeployContext = { switch: SwitchDeps; store: DeployStore };
export type CliContext = EnvContext &
  DomainContext & {
    deploy?: () => DeployContext;
    admin?: () => AdminStore;
    users?: () => UserStore;
    /** `preview sweep`: the database, the agent and GitHub (read for PR state, write for comments). */
    sweep?: () => Omit<SweepDeps, "dryRun">;
    /** GitHub's API with the platform's token (root only), or null without it. */
    github?: () => GitHubRequest | null;
    /** The root-owned image pins (lib/core/image-pin): written only when the CLI runs as root. */
    pins?: {
      isRoot: boolean;
      write(project: string, pin: string): Promise<void>;
    };
    /** Whether stdout is a terminal: a token is never printed to one without --show. */
    stdoutIsTTY?: boolean;
    now?: () => number;
    /** `logs -f`. */
    follow?: LogsContext["follow"];
    /** `metrics collect|<project>`: the metrics tables (cli/metrics-commands.ts). */
    metrics?: MetricsContext["metrics"];
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
  rebuild <project>  (root) production built again with the current NEXT_PUBLIC_* values and
                     redeployed: GitHub runs its deploy-vps.yml with "rebuild"
  redeploy <project> [--pr <n>]
                     the live commit again, same image, new container with the variables
                     as they are now (no build); the old one stays for rollback
  rollback <project> back to the previous kept deployment (no build, no pull)
  regenerate         rewrite every live site's Caddy file; start its container if stopped
  project add <project> <owner/repo> [--memory <mb>] [--domain <host>]... [--no-default-domain]
                     register a project; it answers on <project>.fockus.dev unless told not to
  project pin <project> <owner/repo>
                     (root) the only repository whose images get the project's variables;
                     'project add' as root does it too
  domain add <project> <host> [--redirect none|to-apex|to-www]
                     one more host for a project's production; it goes into Caddy once its
                     DNS resolves to the VPS (prints the records to create)
  domain ls <project> host, status (pending_dns, issuing, ready, error), redirect, certificate
                     expiry and the DNS records to create
  domain rm <project> <host> [--force]
                     never the site's last host; the default <project>.fockus.dev needs --force
  domain redirect <project> <host> none|to-apex|to-www
                     www.<domain> -> <domain> (to-apex) or <domain> -> www.<domain> (to-www), 308
  domain check [--project <p>]
                     DNS and certificate state of each domain; every minute by
                     kit-deploy-domain-check.timer (root). --project: all of its hosts now
  token create <project> [--label <text>] [--show]
                     a deploy token, printed once on stdout to pipe into
                     'gh secret set KIT_DEPLOY_TOKEN -R <owner/repo>'; never to a terminal
                     unless --show
  user create <email>
                     the dashboard's account (one in v1); prints a one-time enrolment link,
                     valid 15 minutes, to register the passkey and TOTP. Terminal only:
                     ssh -t kit-vps kit-deploy user create <email>
  preview sweep [--dry-run]
                     clean what previews left behind: previews of PRs closed on GitHub,
                     pr-<n> containers no deployment holds, preview files with no preview
                     in the database. Nightly by kit-deploy-preview-sweep.timer (root)
  user enrol <email> a new enrolment link for the account (the previous ones stop working)
  db create <project>
                     kit-db databases <project> and <project>_preview (kept if there);
                     DATABASE_URL then reaches its containers by itself, never shown
  db status <project> [--json]
                     size and last backup of <project> and <project>_preview, the
                     off-VPS copy and the backup failures that name them
  env ls <project> <environment>
                     a project's variables in production, preview or development; plain
                     values shown, secrets never
  env set <project> <environment> <NAME> [--plain]
                     the value from stdin, never from argv. Typed with no echo:
                     ssh -t kit-vps kit-deploy env set <project> <env> <NAME>
                     Secret unless --plain (NEXT_PUBLIC_* is always plain)
  env rm <project> <environment> <NAME>
  env pull <project> the Development set as a .env.local, into a pipe or file only:
                     ssh kit-vps kit-deploy env pull <project> > .env.local
  logs <project> [--pr <n>] [--level error|warn|info] [-n <lines>] [-f]
                     the last lines of production (or a PR's preview); -f keeps printing
                     new ones. Kept 14 days by kit-agent
  logs <project> --day <YYYY-MM-DD> [--grep <text>] [--before <cursor>]
                     one day searched, literal text, case-insensitive
  metrics <project>  last CPU and memory per container (against its limit), requests and
                     5xx of the last 24 h
  metrics collect    (root) one sample of containers, the VPS and Caddy's access log into
                     the database. Every 30 s by kit-deploy-metrics.timer
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
    const open = await d.store.findOpenDeployment(p.id, { pr: null }, sha);
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

/**
 * `redeploy <project> [--pr <n>]` (phase 04 U8): the live commit again, same image, in a new
 * container that reads the variables as they are now — the brief's "Redeploy" for a runtime
 * variable. The usual switch: the old container keeps serving until the new one is healthy, and
 * stays for rollback (with the variables it had).
 */
async function redeploy(
  ctx: CliContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const usage = "usage: kit-deploy redeploy <project> [--pr <n>]\n";
  const f = parseFlags(args, ["--pr"], []);
  if (f.error) return fail(`${f.error}\n${usage}`, 2);
  const [project, extra] = f.words;
  if (!project || extra) return fail(usage, 2);
  if (!PROJECT.test(project))
    return fail(`invalid project name "${project}"\n`, 2);
  const prRaw = f.flags.get("--pr")?.at(-1);
  const pr = prRaw === undefined ? null : Number(prRaw);
  if (pr !== null && !(Number.isInteger(pr) && pr >= 1 && pr <= 999_999))
    return fail(`--pr ${prRaw}: expected a PR number\n`, 2);
  const d = needDeploy(ctx);
  const { projectId, where, queued } = await queueRedeploy(
    d.switch.repo,
    project,
    pr,
  );
  const results = await processProject(d.switch, projectId);
  const code = results.some((r) => r.result === "failed") ? 1 : 0;
  if (json) return { code, out: `${JSON.stringify(results)}\n`, err: "" };
  const lines = [
    `redeploying ${project} ${where}: ${queued.sha.slice(0, 12)} generation ${queued.generation}`,
    ...results.map((r) =>
      r.result === "live" ? `live ${r.id}` : `failed ${r.id}: ${r.error}`,
    ),
  ];
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

/** `rebuild <project>` (U8b): production again from its branch, built with today's public
 * variables; the new image replaces the live one as a redeploy, with no downtime. */
async function rebuild(ctx: CliContext, args: string[]): Promise<Result> {
  const [project, extra] = args;
  if (!project || extra)
    return fail("usage: kit-deploy rebuild <project>\n", 2);
  if (!PROJECT.test(project))
    return fail(`invalid project name "${project}"\n`, 2);
  const r = await startRebuild(
    needAdmin(ctx),
    () => ctx.github?.() ?? null,
    project,
  );
  if (!r.ok) {
    if (r.reason === "no_project") return fail(`no project ${project}\n`);
    if (r.reason === "no_token")
      return fail(
        `no GitHub token here (root's /etc/kit-deploy/github.env): run it as ssh kit-vps kit-deploy rebuild ${project}, or start "Deploy (VPS)" by hand in GitHub with "rebuild" ticked\n`,
      );
    const hint = /403|404/.test(r.detail)
      ? " (the token needs Actions: Read and write on this repo, and the repo the new deploy-vps.yml)"
      : "";
    return fail(`rebuild of ${project} not started: ${r.detail}${hint}\n`);
  }
  return ok(
    `rebuild of ${project} started on ${r.repo}@${r.branch}: the Action builds with the current NEXT_PUBLIC_* values and redeploys it (see the repo's Actions tab)\n`,
  );
}

/** `db create <project>`: production's and the previews' databases. The URLs never reach this
 * process: the agent drops kit-db's output; the switch puts DATABASE_URL in by itself. */
async function dbCreate(
  client: AgentClient,
  args: string[],
  json: boolean,
): Promise<Result> {
  const [project, extra] = args;
  if (!project || extra)
    return fail("usage: kit-deploy db create <project>\n", 2);
  if (!PROJECT.test(project))
    return fail(`invalid project name "${project}"\n`, 2);
  let dbs: { database: string; created: boolean }[];
  try {
    dbs = await createDatabases(client, project);
  } catch (e) {
    if (e instanceof AgentRefused) return fail(`${e.code}: ${e.message}\n`);
    throw e;
  }
  if (json) return ok(`${JSON.stringify(dbs)}\n`);
  return ok(
    `${dbs.map((d) => `${d.database}: ${d.created ? "created" : "already there"}`).join("\n")}\nDATABASE_URL goes into ${project}'s production and preview containers by itself from the next deploy (pinned image only)\n`,
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

const REPO = REPO_RE;

function needAdmin(ctx: CliContext): AdminStore {
  if (!ctx.admin) throw new SwitchError("this command needs the database");
  return ctx.admin();
}

/** `--flag value` pairs and bare words; a flag without its value is a usage error. */
function parseFlags(
  args: string[],
  withValue: string[],
  bare: string[],
): { words: string[]; flags: Map<string, string[]>; error?: string } {
  const words: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (withValue.includes(a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--"))
        return { words, flags, error: `${a} needs a value` };
      flags.set(a, [...(flags.get(a) ?? []), v]);
      i++;
    } else if (bare.includes(a)) flags.set(a, []);
    else if (a.startsWith("--"))
      return { words, flags, error: `unknown option ${a}` };
    else words.push(a);
  }
  return { words, flags };
}

async function projectAdd(
  ctx: CliContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const usage =
    "usage: kit-deploy project add <project> <owner/repo> [--memory <mb>] [--domain <host>]... [--no-default-domain]\n";
  const f = parseFlags(args, ["--memory", "--domain"], ["--no-default-domain"]);
  if (f.error) return fail(`${f.error}\n${usage}`, 2);
  const [name, repo, extra] = f.words;
  if (!name || !repo || extra) return fail(usage, 2);
  if (!PROJECT.test(name)) return fail(`invalid project name "${name}"\n`, 2);
  if (name.endsWith("_preview"))
    return fail(
      `invalid project name "${name}": _preview is the suffix of every project's previews database\n`,
      2,
    );
  if (!REPO.test(repo))
    return fail(`invalid repo "${repo}": expected owner/name\n`, 2);
  const memoryRaw =
    f.flags.get("--memory")?.at(-1) ?? String(DEFAULT_MEMORY_MB);
  const memoryMb = Number(memoryRaw);
  if (
    !Number.isInteger(memoryMb) ||
    memoryMb < MEMORY_MB.min ||
    memoryMb > MEMORY_MB.max
  ) {
    return fail(
      `--memory ${memoryRaw}: expected ${MEMORY_MB.min}-${MEMORY_MB.max}\n`,
      2,
    );
  }
  const defaultDomain = !f.flags.has("--no-default-domain");
  if (defaultDomain && !defaultHost(name))
    return fail(
      `${name} has no default domain (reserved): use --no-default-domain --domain <host>\n`,
      2,
    );
  const pin = pinFor(repo);
  const { id, hosts: unique } = await addProject(needAdmin(ctx), {
    name,
    repo,
    memoryMb,
    defaultDomain,
    extraHosts: f.flags.get("--domain") ?? [],
  });
  const pinned = await writePin(ctx, name, pin);
  const note = pinned
    ? ""
    : `not root: its variables stay out of containers until, as root: kit-deploy project pin ${name} ${repo}\n`;
  if (json)
    return {
      code: 0,
      out: `${JSON.stringify({ id, name, repo, memoryMb, hosts: unique, pinned })}\n`,
      err: note,
    };
  return {
    code: 0,
    out: `added ${name} (${repo}), ${memoryMb} MB, domains: ${unique.join(", ") || "none"}\n`,
    err: note,
  };
}

/** True when written; false when this CLI is not root (the agent then refuses variables). */
async function writePin(
  ctx: CliContext,
  project: string,
  pin: string,
): Promise<boolean> {
  if (!ctx.pins?.isRoot) return false;
  await ctx.pins.write(project, pin);
  return true;
}

/** `project pin <project> <owner/repo>`: the repository is typed, never read from the database
 * (the web app can write there); it must also match the database, or deploys would be refused. */
async function projectPin(ctx: CliContext, args: string[]): Promise<Result> {
  const usage = "usage: kit-deploy project pin <project> <owner/repo>\n";
  const [project, repo, extra] = args;
  if (!project || !repo || extra) return fail(usage, 2);
  if (!PROJECT.test(project))
    return fail(`invalid project name "${project}"\n`, 2);
  const pin = pinFor(repo);
  if (!ctx.pins?.isRoot)
    return fail(
      "project pin needs root: ssh kit-vps kit-deploy project pin <project> <owner/repo>\n",
    );
  const stored = await needAdmin(ctx).projectRepo(project);
  if (stored === null) return fail(`no project ${project}\n`);
  if (pinFor(stored) !== pin) {
    return fail(
      `${project} deploys ${stored} in the database, not ${repo}: check which one is right before pinning\n`,
    );
  }
  await ctx.pins.write(project, pin);
  return ok(
    `pinned ${project} to ${pin}: only its images get the project's variables\n`,
  );
}

async function tokenCreate(ctx: CliContext, args: string[]): Promise<Result> {
  const usage =
    "usage: kit-deploy token create <project> [--label <text>] [--show]\n";
  const f = parseFlags(args, ["--label"], ["--show"]);
  if (f.error) return fail(`${f.error}\n${usage}`, 2);
  const [project, extra] = f.words;
  if (!project || extra) return fail(usage, 2);
  if (!PROJECT.test(project))
    return fail(`invalid project name "${project}"\n`, 2);
  if (ctx.stdoutIsTTY && !f.flags.has("--show")) {
    return fail(
      `refusing to print a token to a terminal. Pipe it:\n  kit-deploy token create ${project} | gh secret set KIT_DEPLOY_TOKEN -R <owner/repo>\n(or add --show to see it once)\n`,
      2,
    );
  }
  const { id, token } = await createDeployToken(
    needAdmin(ctx),
    project,
    f.flags.get("--label")?.at(-1) ?? "",
  );
  // stdout carries the token and nothing else, so a pipe gets exactly the secret.
  return {
    code: 0,
    out: `${token}\n`,
    err: `deploy token ${id} for ${project} created; it is not stored and will not be shown again\n`,
  };
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function needUsers(ctx: CliContext): UserStore {
  if (!ctx.users) throw new SwitchError("this command needs the database");
  return ctx.users();
}

/** `user create|enrol <email>`: the link goes to César's terminal and nowhere else — never to a
 * pipe, a file or an agent's captured output (it is a credential for 15 minutes). */
async function user(
  ctx: CliContext,
  sub: string | undefined,
  args: string[],
): Promise<Result> {
  const usage = "usage: kit-deploy user create|enrol <email>\n";
  if (sub !== "create" && sub !== "enrol") return fail(usage, 2);
  const [raw, extra] = args;
  if (!raw || extra) return fail(usage, 2);
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email))
    return fail(`invalid email "${raw}"\n`, 2);
  if (!ctx.stdoutIsTTY) {
    return fail(
      `refusing to print an enrolment link anywhere but a terminal. Run it with a TTY:\n  ssh -t kit-vps kit-deploy user ${sub} ${email}\n`,
      2,
    );
  }
  const now = ctx.now ?? Date.now;
  const expiresAt = new Date(now() + ENROL_LINK_TTL_MS);
  const { token, hash } = generateEnrolmentToken();
  const store = needUsers(ctx);
  if (sub === "create") await store.createUser(email, hash, expiresAt);
  else await store.issueEnrolment(email, hash, expiresAt);
  const minutes = Math.round(ENROL_LINK_TTL_MS / 60000);
  return ok(
    `${sub === "create" ? "account created" : "new link"} for ${email}. Open this link within ${minutes} minutes, once, to register your passkey (and TOTP, if not set yet):\n\n${enrolmentLink(DASHBOARD_HOST, token)}\n\nCopy it whole into the browser's address bar: a link wrapped over two lines opens cut.\nIt is not stored and will not be shown again.\n`,
  );
}

const SWEEP_USAGE = "usage: kit-deploy preview sweep [--dry-run]\n";

async function previewSweep(
  ctx: CliContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const usage = SWEEP_USAGE;
  const f = parseFlags(args, [], ["--dry-run"]);
  if (f.error) return fail(`${f.error}\n${usage}`, 2);
  if (f.words.length > 0) return fail(usage, 2);
  if (!ctx.sweep) throw new SwitchError("this command needs the database");
  const report = await sweepPreviews({
    ...ctx.sweep(),
    dryRun: f.flags.has("--dry-run"),
  });
  const code = report.failed > 0 ? 1 : 0;
  if (json) return { code, out: `${JSON.stringify(report)}\n`, err: "" };
  return { code, out: `${report.lines.join("\n")}\n`, err: "" };
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
      case "rebuild":
        return await rebuild(ctx, args);
      case "redeploy":
        return await redeploy(ctx, args, json);
      case "rollback":
        return await doRollback(ctx, args[0], json);
      case "regenerate":
        return await doRegenerate(ctx, json);
      case "project":
        if (args[0] === "add")
          return await projectAdd(ctx, args.slice(1), json);
        if (args[0] === "pin") return await projectPin(ctx, args.slice(1));
        return fail(
          "usage: kit-deploy project add <project> <owner/repo> [...]\n",
          2,
        );
      case "domain":
        return await domainCommand(ctx, args, json);
      case "token":
        if (args[0] === "create") return await tokenCreate(ctx, args.slice(1));
        return fail(
          "usage: kit-deploy token create <project> [--label <text>] [--show]\n",
          2,
        );
      case "user":
        return await user(ctx, args[0], args.slice(1));
      case "env":
        return await envCommand(client, ctx, args, json);
      case "logs":
        return await logsCommand(client, ctx, args, json);
      case "db":
        if (args[0] === "create")
          return await dbCreate(client, args.slice(1), json);
        if (args[0] === "status")
          return await dbStatusCommand(client, args.slice(1), json);
        return fail(DB_USAGE, 2);
      case "preview":
        if (args[0] === "sweep")
          return await previewSweep(ctx, args.slice(1), json);
        return fail(SWEEP_USAGE, 2);
      case "metrics":
        return await metricsCommand(client, ctx, args, json);
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
    if (e instanceof CoreInputError) return fail(`${e.message}\n`, 2);
    if (
      e instanceof AgentUnreachable ||
      e instanceof SwitchError ||
      e instanceof AdminError ||
      e instanceof OpsError
    ) {
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
