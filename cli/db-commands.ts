/**
 * `kit-deploy db status <project>` (brief F11, D035): the project's two kit-db databases with
 * their size and last backup, the off-VPS copy and the backup failures that name them. Read-only:
 * one `db.status` to kit-agent, which filters kit-db's output down to this project.
 *
 * `kit-deploy db adopt <project> --yes` (root, D048): marks as kit-deploy's a database of the
 * project's name that existed before kit-deploy (created by hand with kit-db), so its containers
 * get DATABASE_URL and the panel its size and backups.
 */
import type { DbStatus } from "../agent/databases";
import type { Response } from "../agent/protocol";
import { assertProject, CoreInputError } from "../lib/core/validate";
import type { AdminStore } from "../lib/db/admin";
import type { AgentClient } from "./client";

type Result = { code: number; out: string; err: string };
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

/** What `db adopt` needs beyond the agent. */
export type DbContext = {
  admin?: () => AdminStore;
  /** Root-owned database markers (lib/core/db-marker): only the CLI run as root writes them. */
  dbMarks?: {
    isRoot: boolean;
    write(database: string): Promise<void>;
  };
};

export const DB_USAGE = `usage:
  kit-deploy db create <project>
  kit-deploy db status <project> [--json]
  kit-deploy db adopt <project> [--yes]   (root)
`;

function agentError(res: Response): string {
  return res.ok ? "" : `kit-agent: ${res.error.code}: ${res.error.message}\n`;
}

/** `5 h ago`, `3 d ago`: enough to see a nightly backup that stopped. */
export function age(at: string, now: number): string {
  const min = Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / (24 * 60))} d ago`;
}

function backup(b: DbStatus["databases"][number]["lastBackup"], now: number) {
  if (b === null) return "none";
  if (b.at === null) return b.file;
  return `${b.at.slice(0, 16).replace("T", " ")} UTC (${age(b.at, now)})`;
}

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

async function status(
  client: AgentClient,
  rawProject: string,
  json: boolean,
  now: number,
): Promise<Result> {
  const project = assertProject(rawProject);
  const res = await client.call("db.status", { project });
  if (!res.ok) return fail(agentError(res));
  const s = res.result as DbStatus;
  if (json) return { code: 0, out: `${JSON.stringify(s)}\n`, err: "" };

  const names = [project, `${project}_preview`];
  const unmanaged = s.unmanaged ?? [];
  const missing = names.filter(
    (n) =>
      !s.databases.some((d) => d.name === n) &&
      !unmanaged.some((u) => u.name === n),
  );
  let out =
    s.databases.length > 0
      ? columns(
          ["DATABASE", "ENV", "SIZE", "LAST BACKUP"],
          s.databases.map((d) => [
            d.name,
            d.env,
            d.sizeText,
            backup(d.lastBackup, now),
          ]),
        )
      : "";
  if (unmanaged.length > 0)
    out += `not managed by kit-deploy: ${unmanaged.map((u) => u.name).join(", ")} (they exist but kit-deploy did not create them: no DATABASE_URL, no details; if they are ${project}'s, as root: kit-deploy db adopt ${project})\n`;
  if (missing.length > 0)
    out += `not created: ${missing.join(", ")} (kit-deploy db create ${project})\n`;
  out += `off-VPS copy: ${s.offVps ?? "not configured"}\n`;
  out +=
    s.failures.length > 0
      ? `last backup failures:\n${s.failures.map((f) => `  ${f}\n`).join("")}`
      : "no recent backup failures\n";
  return { code: 0, out, err: "" };
}

/** `db status`; `db create` stays in commands.ts. */
export async function dbStatusCommand(
  client: AgentClient,
  args: string[],
  json: boolean,
  now: () => number = Date.now,
): Promise<Result> {
  const [project, extra] = args;
  if (!project || extra) return fail(DB_USAGE, 2);
  return status(client, project, json, now());
}

/**
 * `db adopt <project> [--yes]`: root over ssh. Without `--yes` it only says what it would adopt.
 * Only a registered project, and only its own two names; the agent says which of them exist.
 */
export async function dbAdoptCommand(
  client: AgentClient,
  ctx: DbContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const usage = "usage: kit-deploy db adopt <project> [--yes]\n";
  const yes = args.includes("--yes");
  const [raw, extra] = args.filter((a) => a !== "--yes");
  if (!raw || extra || raw.startsWith("-")) return fail(usage, 2);
  let project: string;
  try {
    // Also refuses the reserved names (kit_deploy, postgres…).
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
  if (!ctx.dbMarks?.isRoot)
    return fail(
      "db adopt needs root: ssh kit-vps kit-deploy db adopt <project> --yes\n",
    );
  if (!ctx.admin) return fail("db adopt needs the database (cli.env)\n");
  if ((await ctx.admin().projectRepo(project)) === null)
    return fail(`no project ${project}: kit-deploy project add first\n`);

  const res = await client.call("db.status", { project });
  if (!res.ok) return fail(agentError(res));
  const s = res.result as DbStatus;
  const todo = s.unmanaged ?? [];
  if (todo.length === 0) {
    const msg =
      s.databases.length > 0
        ? `nothing to adopt: ${s.databases.map((d) => d.name).join(", ")} already kit-deploy's\n`
        : `nothing to adopt: kit-db has no ${project} or ${project}_preview (kit-deploy db create ${project})\n`;
    return json
      ? { code: 0, out: `${JSON.stringify({ adopted: [] })}\n`, err: msg }
      : { code: 0, out: msg, err: "" };
  }
  const list = todo.map((d) => `  ${d.name} (${d.env})\n`).join("");
  const what = `${project}'s containers get these databases' DATABASE_URL from their next deploy, and the panel their size and backups:\n${list}`;
  if (!yes)
    return fail(
      `${what}Check they are ${project}'s (not another client's), then re-run with --yes to adopt them.\n`,
      2,
    );
  for (const d of todo) await ctx.dbMarks.write(d.name);
  const adopted = todo.map((d) => d.name);
  if (json)
    return { code: 0, out: `${JSON.stringify({ adopted })}\n`, err: "" };
  return { code: 0, out: `adopted ${adopted.join(", ")}\n${what}`, err: "" };
}
