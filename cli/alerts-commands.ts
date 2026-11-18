/**
 * `kit-deploy alerts check|ls|test|setup` (phase 06, brief F10, D047). `check` is
 * kit-deploy-alerts.timer's (root, every minute): the checks, the incidents' streaks, and one
 * digest email for whatever opened or resolved. `setup` writes /etc/kit-deploy/alerts.env with the
 * Brevo key read from stdin (never argv) and the recipient; `test` sends one sample email.
 */

import { BREVO_KEY_RE, isEmail } from "../lib/alerts/brevo";
import { type CheckRepo, runChecks } from "../lib/alerts/checks";
import { renderDigest, renderTest } from "../lib/alerts/email";
import {
  type AlertRow,
  type AlertStore,
  evaluate,
  type Mailer,
  notify,
} from "../lib/alerts/engine";
import type { AlertsReader } from "../lib/alerts/store";
import { AdminError } from "../lib/db/admin";
import type { AgentClient } from "./client";

export type AlertsDeps = {
  store: AlertStore;
  reader: AlertsReader;
  repo: CheckRepo;
  /** null without a valid alerts.env (or not root: the file is 0600). */
  mailer: Mailer | null;
};

export type AlertsContext = {
  alerts?: () => AlertsDeps;
  /** Root only: writes alerts.env 0600 with these two lines. */
  writeAlertsEnv?: (key: string, to: string) => Promise<void>;
  /** The key César types or pipes. */
  readValue?: () => Promise<string>;
  pins?: { isRoot: boolean };
  now?: () => number;
};

type Result = { code: number; out: string; err: string };
const ok = (out: string, err = ""): Result => ({ code: 0, out, err });
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export const ALERTS_USAGE = `usage:
  kit-deploy alerts ls [--all] [--json]   open alerts (--all: the last 50, resolved too)
  kit-deploy alerts check [--dry-run] [--json]
                     (root) every check once; opens/resolves incidents and emails one digest.
                     Every minute by kit-deploy-alerts.timer. --dry-run: what it sees, no change
  kit-deploy alerts setup --to <email>
                     (root) the Brevo API key from stdin, typed with no echo:
                     ssh -t kit-vps kit-deploy alerts setup --to <email>
  kit-deploy alerts test  (root) one sample email, to check it lands in the inbox
`;

function need(ctx: AlertsContext): AlertsDeps {
  if (!ctx.alerts) throw new AdminError("this command needs the database");
  return ctx.alerts();
}

const iso = (d: Date | null) =>
  d ? d.toISOString().slice(0, 16).replace("T", " ") : "-";

function rowsTable(rows: AlertRow[]): string {
  const header = ["OPENED", "STATE", "KIND", "PROJECT", "TITLE"];
  const cells = rows.map((a) => [
    iso(a.openedAt),
    a.resolvedAt ? `resolved ${iso(a.resolvedAt)}` : "open",
    a.kind,
    a.project ?? "-",
    a.title,
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...cells.map((r) => (r[i] ?? "").length)),
  );
  return `${[header, ...cells]
    .map((r) =>
      r
        .map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i] ?? 0)))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")}\n`;
}

async function ls(ctx: AlertsContext, args: string[], json: boolean) {
  const d = need(ctx);
  const rows = args.includes("--all")
    ? await d.reader.recent(50)
    : await d.reader.open();
  if (json) return ok(`${JSON.stringify(rows)}\n`);
  if (rows.length === 0)
    return ok(args.includes("--all") ? "no alerts yet\n" : "no open alerts\n");
  return ok(rowsTable(rows));
}

async function check(
  client: AgentClient,
  ctx: AlertsContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const d = need(ctx);
  const nowMs = (ctx.now ?? Date.now)();
  const checked = await runChecks({ agent: client, repo: d.repo, now: nowMs });
  const warn = checked.problems.map((p) => `warning: ${p}\n`).join("");
  if (args.includes("--dry-run")) {
    if (json) return ok(`${JSON.stringify(checked.observations)}\n`, warn);
    const lines = checked.observations.map(
      (o) => `${o.failing ? "FAILING" : "ok     "}  ${o.key}  ${o.title}`,
    );
    return ok(
      lines.length ? `${lines.join("\n")}\n` : "nothing to check\n",
      warn,
    );
  }
  const now = new Date(nowMs);
  const t = await evaluate(d.store, checked.observations, checked.covered, now);
  const n = await notify(d.store, d.mailer, renderDigest, now);
  const summary = {
    checked: checked.observations.length,
    failing: checked.observations.filter((o) => o.failing).length,
    opened: t.opened,
    resolved: t.resolved,
    ...n,
  };
  if (json) return ok(`${JSON.stringify(summary)}\n`, warn);
  const out = [
    ...t.opened.map((k) => `opened ${k}`),
    ...t.resolved.map((k) => `resolved ${k}`),
    `checked ${summary.checked}, failing ${summary.failing}, emailed ${n.sent}` +
      ("waiting" in n ? ` (${n.waiting} waiting: ${n.reason})` : ""),
  ];
  return ok(`${out.join("\n")}\n`, warn);
}

async function setup(ctx: AlertsContext, args: string[]): Promise<Result> {
  if (!ctx.pins?.isRoot || !ctx.writeAlertsEnv)
    return fail(
      "alerts setup needs root: ssh -t kit-vps kit-deploy alerts setup --to <email>\n",
    );
  const i = args.indexOf("--to");
  const to = i >= 0 ? (args[i + 1] ?? "") : "";
  if (!isEmail(to)) return fail(`${ALERTS_USAGE}`, 2);
  if (!ctx.readValue) throw new AdminError("no stdin to read the key from");
  const key = (await ctx.readValue()).trim();
  if (!BREVO_KEY_RE.test(key))
    // Never echo what was typed: it may be a real key with a typo.
    return fail(
      "that is not a Brevo API v3 key (xkeysib-…); nothing written\n",
      2,
    );
  await ctx.writeAlertsEnv(key, to);
  return ok(
    `alerts.env written (0600 root): alerts go to ${to}.\nNext: kit-deploy alerts test\n`,
  );
}

async function test(ctx: AlertsContext): Promise<Result> {
  const d = need(ctx);
  if (!d.mailer)
    return fail(
      "no alerts.env (or not root): run kit-deploy alerts setup --to <email> first\n",
    );
  await d.mailer.send(renderTest(new Date((ctx.now ?? Date.now)())));
  return ok(
    'sent: look for "[kit-deploy] Correo de prueba" in the inbox (and in spam)\n',
  );
}

export async function alertsCommand(
  client: AgentClient,
  ctx: AlertsContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "ls":
      return ls(ctx, rest, json);
    case "check":
      return check(client, ctx, rest, json);
    case "setup":
      return setup(ctx, rest);
    case "test":
      try {
        return await test(ctx);
      } catch (e) {
        return fail(`${(e as Error).message}\n`);
      }
    default:
      return fail(ALERTS_USAGE, 2);
  }
}
