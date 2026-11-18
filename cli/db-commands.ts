/**
 * `kit-deploy db status <project>` (brief F11, D035): the project's two kit-db databases with
 * their size and last backup, the off-VPS copy and the backup failures that name them. Read-only:
 * one `db.status` to kit-agent, which filters kit-db's output down to this project.
 */
import type { DbStatus } from "../agent/databases";
import type { Response } from "../agent/protocol";
import { assertProject } from "../lib/core/validate";
import type { AgentClient } from "./client";

type Result = { code: number; out: string; err: string };
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export const DB_USAGE = `usage:
  kit-deploy db create <project>
  kit-deploy db status <project> [--json]
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
  const missing = names.filter((n) => !s.databases.some((d) => d.name === n));
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
