/**
 * `kit-deploy env ls|set|rm` (brief F4/F14). The value of `set` comes only from stdin — César types
 * it in his terminal (no echo) or pipes it — and is never printed, logged or put in argv. The CLI
 * cannot read a secret back: only kit-agent holds the key, and it returns plain variables only
 * (Development's secrets are `env pull`'s, phase 04 U6).
 */
import type { Response } from "../agent/protocol";
import type { Sealed } from "../lib/core/crypto";
import {
  assertEnvironment,
  assertEnvName,
  assertEnvValue,
  dotenvLine,
  type Environment,
  isPublicName,
} from "../lib/core/env";
import { assertProject } from "../lib/core/validate";
import { AdminError } from "../lib/db/admin";
import type { EnvStore, StoredVar } from "../lib/db/env-store";
import type { AgentClient } from "./client";

export type EnvContext = {
  env?: () => EnvStore;
  /** The value César types or pipes: everything on stdin (a terminal: one line, not echoed). */
  readValue?: () => Promise<string>;
  /** `ssh:<user>` for the audit log. */
  actor?: string;
  /** Whether stdout is a terminal: `env pull` never prints values to one. */
  stdoutIsTTY?: boolean;
};

type Result = { code: number; out: string; err: string };
const ok = (out: string, err = ""): Result => ({ code: 0, out, err });
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export const ENV_USAGE = `usage:
  kit-deploy env ls <project> <environment>
  kit-deploy env set <project> <environment> <NAME> [--plain]   (value on stdin)
  kit-deploy env rm <project> <environment> <NAME>
  kit-deploy env pull <project> > .env.local   (Development, never to a terminal)
environments: production, preview, development
`;

export { dotenvLine };

/** Long plain values are cut in the table; --json has them whole. */
const SHOWN_CHARS = 60;

function agentError(res: Response): string {
  return res.ok ? "" : `kit-agent: ${res.error.code}: ${res.error.message}\n`;
}

function needStore(ctx: EnvContext): EnvStore {
  if (!ctx.env) throw new AdminError("this command needs the database");
  return ctx.env();
}

/** One trailing newline from `echo … |` or the terminal's Enter is not part of the value. */
export function trimValue(raw: string): string {
  return raw.replace(/\r?\n$/, "");
}

function target(project: string | undefined, environment: string | undefined) {
  if (!project || !environment) return null;
  return {
    project: assertProject(project),
    environment: assertEnvironment(environment),
  };
}

/** When a change reaches the running site (U8 adds the redeploy/rebuild commands). */
function effect(name: string, environment: Environment, project: string) {
  if (environment === "development")
    return `\`kit-deploy env pull ${project} > .env.local\` picks it up`;
  if (isPublicName(name))
    return `NEXT_PUBLIC_* is inlined at build: it needs a new build of ${environment}`;
  return `the next deploy of ${environment} gets it`;
}

async function ls(
  client: AgentClient,
  ctx: EnvContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const [p, e, extra] = args;
  const t = target(p, e);
  if (!t || extra) return fail(ENV_USAGE, 2);
  const rows = await needStore(ctx).list(t.project, t.environment);
  const plain = rows.filter((r) => !r.secret);
  const values = new Map<string, string>();
  if (plain.length > 0) {
    const res = await client.call("env.reveal", {
      ...t,
      vars: plain.map(({ name, secret, sealed }) => ({ name, secret, sealed })),
    });
    if (!res.ok) return fail(agentError(res));
    for (const v of res.result as { name: string; value: string }[])
      values.set(v.name, v.value);
  }
  const out = rows.map((r: StoredVar) => ({
    name: r.name,
    secret: r.secret,
    value: r.secret ? null : (values.get(r.name) ?? null),
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy,
  }));
  if (json) return ok(`${JSON.stringify(out)}\n`);
  if (out.length === 0)
    return ok(`no variables in ${t.project} ${t.environment}\n`);
  const cut = (v: string) =>
    v.length > SHOWN_CHARS ? `${v.slice(0, SHOWN_CHARS)}…` : v;
  const width = Math.max(4, ...out.map((r) => r.name.length));
  const lines = out.map((r) =>
    `${r.name.padEnd(width)}  ${(r.secret ? "secret" : "plain").padEnd(6)}  ${r.updatedAt.slice(0, 16).replace("T", " ")}  ${r.updatedBy.padEnd(12)}  ${r.secret ? "(hidden)" : cut(r.value ?? "")}`.trimEnd(),
  );
  return ok(
    `${"NAME".padEnd(width)}  TYPE    UPDATED (UTC)     BY            VALUE\n${lines.join("\n")}\n`,
  );
}

async function set(
  client: AgentClient,
  ctx: EnvContext,
  args: string[],
): Promise<Result> {
  const words = args.filter((a) => a !== "--plain");
  const unknown = words.find((a) => a.startsWith("--"));
  if (unknown) return fail(`unknown option ${unknown}\n${ENV_USAGE}`, 2);
  const [p, e, rawName, extra] = words;
  const t = target(p, e);
  if (!t || !rawName || extra) return fail(ENV_USAGE, 2);
  const name = assertEnvName(rawName);
  // NEXT_PUBLIC_* ships in the browser bundle: it is plain whatever the flag says.
  const secret = !args.includes("--plain") && !isPublicName(name);
  const store = needStore(ctx);
  if (!ctx.readValue) throw new AdminError("no stdin to read the value from");
  const value = assertEnvValue(trimValue(await ctx.readValue()));
  const res = await client.call("env.seal", { ...t, name, secret, value });
  if (!res.ok) return fail(agentError(res));
  const { created } = await store.set(
    t.project,
    t.environment,
    { name, secret, sealed: res.result as Sealed },
    ctx.actor ?? "ssh:unknown",
  );
  return ok(
    `${created ? "set" : "replaced"} ${name} in ${t.project} ${t.environment} (${secret ? "secret: it can be replaced, never read back" : "plain"}); ${effect(name, t.environment, t.project)}\n`,
  );
}

async function rm(ctx: EnvContext, args: string[]): Promise<Result> {
  const [p, e, rawName, extra] = args;
  const t = target(p, e);
  if (!t || !rawName || extra) return fail(ENV_USAGE, 2);
  const name = assertEnvName(rawName);
  const gone = await needStore(ctx).remove(
    t.project,
    t.environment,
    name,
    ctx.actor ?? "ssh:unknown",
  );
  if (!gone) return fail(`no ${name} in ${t.project} ${t.environment}\n`);
  return ok(
    `removed ${name} from ${t.project} ${t.environment}; ${effect(name, t.environment, t.project).replace("gets it", "drops it").replace("picks it up", "leaves it out")}\n`,
  );
}

/**
 * `env pull <project>` (brief F5): the Development set as a `.env.local`, on stdout and only into
 * a pipe or a file — never a terminal, where the values would sit on screen. The equivalent of
 * `vercel env pull .env.local --yes`, without a token on the PC: `ssh kit-vps` is the access.
 */
async function pull(
  client: AgentClient,
  ctx: EnvContext,
  args: string[],
): Promise<Result> {
  const [p, extra] = args;
  if (!p || extra) return fail(ENV_USAGE, 2);
  const project = assertProject(p);
  if (ctx.stdoutIsTTY) {
    return fail(
      `refusing to print ${project}'s variables to a terminal. Write them to the file:\n  ssh kit-vps kit-deploy env pull ${project} > .env.local\n`,
      2,
    );
  }
  const rows = await needStore(ctx).list(project, "development");
  const header = `# kit-deploy env pull ${project} (development). Do not commit this file.\n`;
  if (rows.length === 0) {
    return ok(
      header,
      `no development variables in ${project}: empty .env.local\n`,
    );
  }
  const res = await client.call("env.reveal", {
    project,
    environment: "development",
    vars: rows.map(({ name, secret, sealed }) => ({ name, secret, sealed })),
  });
  if (!res.ok) return fail(agentError(res));
  const values = res.result as { name: string; value: string }[];
  return ok(
    header + values.map((v) => dotenvLine(v.name, v.value)).join(""),
    // stderr: the names only, so the terminal shows what was written and nothing else.
    `wrote ${values.length} development variable(s) of ${project}: ${values.map((v) => v.name).join(", ")}\n`,
  );
}

export async function envCommand(
  client: AgentClient,
  ctx: EnvContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "ls":
      return ls(client, ctx, rest, json);
    case "set":
      return set(client, ctx, rest);
    case "rm":
      return rm(ctx, rest);
    case "pull":
      return pull(client, ctx, rest);
    default:
      return fail(ENV_USAGE, 2);
  }
}
