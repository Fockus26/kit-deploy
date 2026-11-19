/**
 * `kit-deploy project rm <project> [--yes]` (root, D059): a project off the platform. Without
 * `--yes` it only says what it would remove; with it, first the rows (so no deploy, cron call,
 * domain check or alert acts on the project any more), then kit-agent's `project.remove` (its Caddy
 * files, containers, images and pin). The kit-db databases are never touched: the command prints
 * how to drop them by hand (D060). Running it again is not an error.
 */
import type { ProjectRemoval } from "../agent/project-remove";
import { assertProject, CoreInputError } from "../lib/core/validate";
import type { AuditEntry } from "../lib/db/audit";
import type {
  ProjectFootprint,
  ProjectRemovalStore,
} from "../lib/db/project-remove";
import { type AgentClient, AgentUnreachable } from "./client";

type Result = { code: number; out: string; err: string };
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export type ProjectRemoveContext = {
  removal?: () => ProjectRemovalStore;
  /** `ssh:<user>` for the audit row. */
  actor?: string;
  pins?: { isRoot: boolean };
};

export const PROJECT_RM_USAGE =
  "usage: kit-deploy project rm <project> [--yes]\n";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function rowsLine(project: string, f: ProjectFootprint): string {
  const hosts = f.hosts.length > 0 ? ` (${f.hosts.join(", ")})` : "";
  return [
    `project ${project} (${f.repo})`,
    `${plural(f.deployments, "deployment")} (${plural(f.previews, "preview")})`,
    `${plural(f.hosts.length, "domain")}${hosts}`,
    plural(f.variables, "variable"),
    plural(f.tokens, "deploy token"),
    plural(f.cronJobs, "cron job"),
    `${plural(f.openAlerts, "open alert")} (closed, no email)`,
  ].join(", ");
}

function section(label: string, items: string[]): string {
  if (items.length === 0) return "";
  const width = 12;
  return items
    .map(
      (item, i) =>
        `  ${i === 0 ? label.padEnd(width) : " ".repeat(width)}${item}\n`,
    )
    .join("");
}

/** The databases left in kit-db and the exact commands to drop them, if César wants to. */
function keptLines(project: string, m: ProjectRemoval): string {
  const dbs = m.databases.filter((d) => d.exists);
  let out = "kept:\n";
  if (dbs.length > 0) {
    out += `  databases ${dbs.map((d) => d.database).join(", ")} (kit-db): kit-deploy never drops one. To drop them, as root, once their last backup is checked (kit-deploy db status ${project}):\n`;
    for (const d of dbs) {
      const marker = d.managed
        ? ` && rm /etc/kit-deploy/dbs/${d.database}`
        : "";
      out += `    kit-db drop ${d.database} --yes${marker}\n`;
    }
  } else out += `  no kit-db database named ${project} or ${project}_preview\n`;
  out +=
    "  the audit log, closed alerts, metric samples (30 days), logs (14 days) and certificates\n";
  return out;
}

function machineLines(m: ProjectRemoval): string {
  return (
    section("caddy", m.sites) +
    section(
      "containers",
      m.containers.map((c) => `${c.name} (${c.state})`),
    ) +
    section("images", m.images) +
    section("pin", m.pin ? [m.pin] : [])
  );
}

function tailLines(m: ProjectRemoval): string {
  let out = "";
  if (m.skipped.length > 0)
    out += `skipped:\n${m.skipped.map((s) => `  ${s}\n`).join("")}`;
  if (m.failed.length > 0)
    out += `failed:\n${m.failed.map((s) => `  ${s}\n`).join("")}`;
  return out;
}

function emptyMachine(m: ProjectRemoval): boolean {
  return (
    m.sites.length === 0 &&
    m.containers.length === 0 &&
    m.images.length === 0 &&
    m.pin === null
  );
}

async function agentRemove(
  client: AgentClient,
  project: string,
  dryRun: boolean,
): Promise<ProjectRemoval | string> {
  try {
    const res = await client.call("project.remove", { project, dryRun });
    if (!res.ok) return `kit-agent: ${res.error.code}: ${res.error.message}`;
    return res.result as ProjectRemoval;
  } catch (e) {
    if (e instanceof AgentUnreachable) return e.message;
    throw e;
  }
}

export async function projectRmCommand(
  client: AgentClient,
  ctx: ProjectRemoveContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const yes = args.includes("--yes");
  const words = args.filter((a) => a !== "--yes");
  const flag = words.find((a) => a.startsWith("-"));
  if (flag) return fail(`unknown option ${flag}\n${PROJECT_RM_USAGE}`, 2);
  const [raw, extra] = words;
  if (!raw || extra) return fail(PROJECT_RM_USAGE, 2);
  let project: string;
  try {
    // Also refuses the reserved names (kit_deploy, postgres…): never the platform's own.
    project = assertProject(raw);
  } catch (e) {
    if (e instanceof CoreInputError) return fail(`${e.message}\n`, 2);
    throw e;
  }
  if (project.endsWith("_preview"))
    return fail(
      `invalid project name "${project}": _preview is the suffix of every project's previews database\n`,
      2,
    );
  if (!ctx.pins?.isRoot)
    return fail(
      `project rm needs root: ssh kit-vps kit-deploy project rm ${project}\n`,
    );
  if (!ctx.removal) return fail("project rm needs the database (cli.env)\n");
  const store = ctx.removal();
  const rows = await store.footprint(project);

  if (!yes) {
    const m = await agentRemove(client, project, true);
    if (typeof m === "string") return fail(`${m}\n`);
    if (json)
      return {
        code: 0,
        out: `${JSON.stringify({ project, dryRun: true, rows, machine: m })}\n`,
        err: "",
      };
    const nothing = rows === null && emptyMachine(m);
    const head = nothing
      ? `nothing to remove for ${project}: no rows, no Caddy files, containers, images or pin\n`
      : `${project}: would remove\n${section("rows", rows ? [rowsLine(project, rows)] : [])}${machineLines(m)}`;
    const next = nothing
      ? ""
      : `Nothing done. Re-run with --yes to remove it: kit-deploy project rm ${project} --yes\n`;
    return {
      code: 0,
      out: `${head}${tailLines(m)}${keptLines(project, m)}${next}`,
      err: "",
    };
  }

  const audit: AuditEntry = {
    actor: ctx.actor ?? "ssh:unknown",
    action: "project.remove",
    project,
    environment: null,
    name: rows?.repo ?? null,
  };
  // The rows first: from here on nothing deploys, calls, checks or regenerates this project.
  const rowsRemoved = rows !== null && (await store.remove(project, audit));
  const m = await agentRemove(client, project, false);
  if (typeof m === "string") {
    const done = rowsRemoved ? `removed ${project}'s rows\n` : "";
    return {
      code: 1,
      out: done,
      err: `${m}\nthe machine side was not finished: run it again once kit-agent answers: kit-deploy project rm ${project} --yes\n`,
    };
  }
  // A run that only found leftovers on the machine still leaves its trace.
  if (!rowsRemoved && !emptyMachine(m)) await store.record(audit);
  const code = m.failed.length > 0 ? 1 : 0;
  if (json)
    return {
      code,
      out: `${JSON.stringify({ project, dryRun: false, rows: rowsRemoved ? rows : null, machine: m })}\n`,
      err: "",
    };
  const nothing = !rowsRemoved && emptyMachine(m);
  const head = nothing
    ? `nothing to remove for ${project}: already gone\n`
    : `removed ${project}:\n${section("rows", rowsRemoved && rows ? [rowsLine(project, rows)] : [])}${machineLines(m)}`;
  const retry =
    m.failed.length > 0
      ? `Some steps failed: fix them and run it again (kit-deploy project rm ${project} --yes)\n`
      : "";
  return {
    code,
    out: `${head}${tailLines(m)}${keptLines(project, m)}${retry}`,
    err: "",
  };
}
