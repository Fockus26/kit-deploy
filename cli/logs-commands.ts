/**
 * `kit-deploy logs` (brief F8, D014): a project's runtime logs, kept 14 days by kit-agent. The last
 * lines (`logs.tail`), one day searched (`logs.search`), or `-f` to keep printing new lines — by
 * asking `logs.tail` again every 2 s, so the socket protocol stays one request, one answer.
 */
import type { LogEntry } from "../agent/logs";
import type { Response } from "../agent/protocol";
import { assertProject } from "../lib/core/validate";
import type { AgentClient } from "./client";

export type LogsContext = {
  /** For `-f`: prints as lines arrive; `sleep` resolves false to stop (tests; the CLI never does). */
  follow?: {
    write(text: string): void;
    sleep(ms: number): Promise<boolean>;
  };
  now?: () => number;
};

type Result = { code: number; out: string; err: string };
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export const LOGS_USAGE = `usage:
  kit-deploy logs <project> [--pr <n>] [--level error|warn|info] [-n <lines>] [-f]
  kit-deploy logs <project> [--pr <n>] [--level <l>] --day <YYYY-MM-DD> [--grep <text>] [-n <max>] [--before <cursor>]
  kit-deploy logs <project> [--pr <n>] [--level <l>] --grep <text>   (today)
the last 14 days are kept; --grep is a literal, case-insensitive text
`;

export const FOLLOW_MS = 2_000;
const LEVELS = ["error", "warn", "info"] as const;
type Level = (typeof LEVELS)[number];

function agentError(res: Response): string {
  return res.ok ? "" : `kit-agent: ${res.error.code}: ${res.error.message}\n`;
}

/** A log line is the project's text: its control characters (ANSI escapes, `\r`) never reach the
 * terminal as such. */
export function printable(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (c) =>
    c === "\u001b" ? "^[" : "?",
  );
}

export function formatEntry(e: LogEntry): string {
  const stream = e.stream === "stderr" ? " stderr" : "";
  return `${e.ts.slice(0, 23)}Z ${e.env} ${e.level}${stream} ${printable(e.line)}\n`;
}

type Parsed = {
  project: string;
  env?: string;
  level?: Level;
  n?: number;
  day?: string;
  grep?: string;
  before?: number;
  follow: boolean;
};

const WITH_VALUE = ["--pr", "--level", "-n", "--day", "--grep", "--before"];

function parse(args: string[]): Parsed | string {
  const words: string[] = [];
  const v = new Map<string, string>();
  let follow = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (WITH_VALUE.includes(a)) {
      const val = args[i + 1];
      if (val === undefined) return `${a} needs a value`;
      v.set(a, val);
      i++;
    } else if (a === "-f" || a === "--follow") follow = true;
    else if (a.startsWith("-")) return `unknown option ${a}`;
    else words.push(a);
  }
  const [project, extra] = words;
  if (!project || extra !== undefined) return "";
  assertProject(project);
  const p: Parsed = { project, follow };
  const pr = v.get("--pr");
  if (pr !== undefined) {
    if (!/^[1-9][0-9]{0,5}$/.test(pr))
      return `--pr ${pr}: expected a PR number`;
    p.env = `pr-${pr}`;
  }
  const level = v.get("--level");
  if (level !== undefined) {
    if (!(LEVELS as readonly string[]).includes(level))
      return `--level ${level}: expected error, warn or info`;
    p.level = level as Level;
  }
  const n = v.get("-n");
  if (n !== undefined) {
    if (!/^[1-9][0-9]{0,3}$/.test(n))
      return `-n ${n}: expected a number of lines`;
    p.n = Number(n);
  }
  const day = v.get("--day");
  if (day !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
      return `--day ${day}: expected YYYY-MM-DD`;
    p.day = day;
  }
  const grep = v.get("--grep");
  if (grep !== undefined) {
    if (grep === "" || grep.length > 200) return "--grep: 1 to 200 characters";
    p.grep = grep;
  }
  const before = v.get("--before");
  if (before !== undefined) {
    if (!/^[0-9]{1,15}$/.test(before))
      return `--before ${before}: expected the cursor a search printed`;
    p.before = Number(before);
  }
  const searching = p.day !== undefined || p.grep !== undefined;
  if (p.follow && searching)
    return "-f follows the live lines: not with --day or --grep";
  if (p.before !== undefined && !searching)
    return "--before pages a search: use it with --day or --grep";
  if (!searching && p.n !== undefined && p.n > 500)
    return "-n: at most 500 lines";
  if (searching && p.n !== undefined && p.n > 1000)
    return "-n: at most 1000 matches";
  return p;
}

const key = (e: LogEntry) => `${e.ts}\u0000${e.container}\u0000${e.line}`;

export async function logsCommand(
  client: AgentClient,
  ctx: LogsContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const p = parse(args);
  if (typeof p === "string")
    return fail(p ? `${p}\n${LOGS_USAGE}` : LOGS_USAGE, 2);
  const filter = {
    ...(p.env ? { env: p.env } : {}),
    ...(p.level ? { level: p.level } : {}),
  };

  if (p.day !== undefined || p.grep !== undefined) {
    const day =
      p.day ?? new Date((ctx.now ?? Date.now)()).toISOString().slice(0, 10);
    const res = await client.call("logs.search", {
      project: p.project,
      day,
      ...filter,
      ...(p.grep ? { query: p.grep } : {}),
      ...(p.n ? { limit: p.n } : {}),
      ...(p.before !== undefined ? { before: p.before } : {}),
    });
    if (!res.ok) return fail(agentError(res));
    const r = res.result as {
      day: string;
      entries: LogEntry[];
      next: number | null;
    };
    if (json) return { code: 0, out: `${JSON.stringify(r)}\n`, err: "" };
    // Newest first from the agent; read top to bottom like a log.
    const out = [...r.entries].reverse().map(formatEntry).join("");
    const more =
      r.next === null
        ? ""
        : `older matches: the same command with --before ${r.next}
`;
    const none =
      r.entries.length === 0 ? `no lines in ${p.project} on ${r.day}\n` : "";
    return { code: 0, out, err: none + more };
  }

  const tail = () =>
    client.call("logs.tail", {
      project: p.project,
      ...filter,
      ...(p.n ? { lines: p.n } : {}),
    });
  const first = await tail();
  if (!first.ok) return fail(agentError(first));
  const show = (es: LogEntry[]) =>
    json
      ? es.map((e) => `${JSON.stringify(e)}\n`).join("")
      : es.map(formatEntry).join("");
  const entries = (first.result as { entries: LogEntry[] }).entries;
  if (!p.follow) {
    if (json)
      return { code: 0, out: `${JSON.stringify(first.result)}\n`, err: "" };
    return { code: 0, out: show(entries), err: "" };
  }
  if (!ctx.follow) return fail("-f needs a terminal or a pipe to write to\n");
  const { write, sleep } = ctx.follow;
  write(show(entries));
  // What was printed in the last answer: the next one overlaps it, only the rest is new.
  let seen = new Set(entries.map(key));
  let last = entries.at(-1)?.ts ?? "";
  while (await sleep(FOLLOW_MS)) {
    const res = await tail();
    if (!res.ok) return fail(agentError(res));
    const es = (res.result as { entries: LogEntry[] }).entries;
    const fresh = es.filter(
      (e) => e.ts > last || (e.ts === last && !seen.has(key(e))),
    );
    if (fresh.length > 0) write(show(fresh));
    seen = new Set(es.map(key));
    last = es.at(-1)?.ts ?? last;
  }
  return { code: 0, out: "", err: "" };
}
