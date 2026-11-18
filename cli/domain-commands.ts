/**
 * `kit-deploy domain add|ls|rm|redirect|check` (brief F6). A host is added in `pending_dns`; the
 * minute timer (`domain check`) puts it in its Caddy site once its DNS points to the VPS and
 * follows its certificate (D028, D029). `ls` prints the records to create at the DNS provider.
 */
import { assertProject } from "../lib/core/validate";
import { AdminError, type AdminStore } from "../lib/db/admin";
import type { DomainRedirect } from "../lib/db/schema";
import { type CheckDeps, checkDomains } from "../lib/domains/check";
import { describeInstructions, dnsInstructions } from "../lib/domains/dns";
import type { DomainRow } from "../lib/domains/store";
import {
  addDomain,
  parseRedirect,
  projectHost,
  removeDomain,
  setDomainRedirect,
} from "../lib/ops/domains";

export type DomainContext = {
  admin?: () => AdminStore;
  /** The store, the resolver, kit-agent and the site rewrite; opened only when used. */
  domains?: () => CheckDeps;
};

type Result = { code: number; out: string; err: string };
const ok = (out: string, err = ""): Result => ({ code: 0, out, err });
const fail = (err: string, code = 1): Result => ({ code, out: "", err });

export const DOMAIN_USAGE = `usage:
  kit-deploy domain add <project> <host> [--redirect none|to-apex|to-www]
  kit-deploy domain ls <project> [--json]
  kit-deploy domain rm <project> <host> [--force]
  kit-deploy domain redirect <project> <host> none|to-apex|to-www
  kit-deploy domain check [--project <project>] [--json]
`;

function needDomains(ctx: DomainContext): CheckDeps {
  if (!ctx.domains) throw new AdminError("this command needs the database");
  return ctx.domains();
}

function needAdmin(ctx: DomainContext): AdminStore {
  if (!ctx.admin) throw new AdminError("this command needs the database");
  return ctx.admin();
}

function project(raw: string): string {
  return assertProject(raw);
}

const host = projectHost;
const redirect = parseRedirect;

function siteLine(p: string, site: "rewritten" | "not_live"): string {
  return site === "rewritten"
    ? `${p}'s Caddy site rewritten\n`
    : `${p} is not live: its next deploy writes the site\n`;
}

async function add(ctx: DomainContext, args: string[]): Promise<Result> {
  const words: string[] = [];
  let r: DomainRedirect = "none";
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--redirect") {
      const v = args[++i];
      if (v === undefined)
        return fail(`--redirect needs a value\n${DOMAIN_USAGE}`, 2);
      r = redirect(v);
    } else words.push(a);
  }
  const [rawProject, rawHost, extra] = words;
  if (!rawProject || !rawHost || extra) return fail(DOMAIN_USAGE, 2);
  const p = project(rawProject);
  const h = host(rawHost);
  await addDomain(
    {
      admin: needAdmin(ctx),
      listDomains: (name) => needDomains(ctx).store.list(name),
    },
    { project: p, host: h, redirect: r },
  );
  return ok(
    `added ${h} to ${p} (pending DNS). Create at the DNS provider: ${describeInstructions(dnsInstructions(h, r))}\nkit-deploy domain check puts it in Caddy within a minute of it resolving to the VPS.\n`,
  );
}

function row(d: DomainRow) {
  const instructions = (() => {
    try {
      return dnsInstructions(d.host, d.redirect);
    } catch {
      return dnsInstructions(d.host);
    }
  })();
  return {
    host: d.host,
    status: d.status,
    redirect: d.redirect,
    redirectsTo: instructions.redirectsTo,
    certNotAfter: d.certNotAfter?.toISOString() ?? null,
    dnsCheckedAt: d.dnsCheckedAt?.toISOString() ?? null,
    lastError: d.lastError,
    dns: instructions,
  };
}

async function ls(
  ctx: DomainContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const [rawProject, extra] = args;
  if (!rawProject || extra) return fail(DOMAIN_USAGE, 2);
  const p = project(rawProject);
  const rows = (await needDomains(ctx).store.list(p)).map(row);
  if (json) return ok(`${JSON.stringify(rows)}\n`);
  if (rows.length === 0) return ok(`${p} has no domains\n`);
  const lines = rows.map((d) => {
    const parts = [
      d.host,
      d.status,
      d.redirectsTo ? `→ ${d.redirectsTo}` : "serves",
      d.certNotAfter ? `cert until ${d.certNotAfter.slice(0, 10)}` : "no cert",
      `DNS: ${describeInstructions(d.dns)}`,
    ];
    if (d.lastError) parts.push(`(${d.lastError})`);
    return parts.join("  ");
  });
  return ok(`${lines.join("\n")}\n`);
}

async function rm(ctx: DomainContext, args: string[]): Promise<Result> {
  const force = args.includes("--force");
  const words = args.filter((a) => a !== "--force");
  const [rawProject, rawHost, extra] = words;
  if (!rawProject || !rawHost || extra) return fail(DOMAIN_USAGE, 2);
  const p = project(rawProject);
  const h = host(rawHost);
  const r = await removeDomain(
    needDomains(ctx),
    { project: p, host: h },
    { force },
  );
  if (!r.ok) {
    if (r.reason === "default")
      return fail(
        `${h} is ${p}'s default domain: --force to remove it anyway\n`,
        2,
      );
    if (r.reason === "last")
      return fail(
        `${h} is the last host ${p}'s site serves: add another one (and let it point) first\n`,
      );
    return fail(`${h} is not a domain of ${p}\n`);
  }
  return ok(`removed ${h} from ${p}\n${siteLine(p, r.site)}`);
}

async function setRedirect(
  ctx: DomainContext,
  args: string[],
): Promise<Result> {
  const [rawProject, rawHost, rawRedirect, extra] = args;
  if (!rawProject || !rawHost || !rawRedirect || extra)
    return fail(DOMAIN_USAGE, 2);
  const p = project(rawProject);
  const h = host(rawHost);
  const r = redirect(rawRedirect);
  const res = await setDomainRedirect(needDomains(ctx), {
    project: p,
    host: h,
    redirect: r,
  });
  if (!res.ok) return fail(`${h} is not a domain of ${p}\n`);
  const to = res.redirectsTo;
  return ok(
    `${h}: ${to ? `redirects to ${to}` : "serves the site"}\n${siteLine(p, res.site)}`,
  );
}

async function check(
  ctx: DomainContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  let only: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--project") return fail(DOMAIN_USAGE, 2);
    const v = args[++i];
    if (v === undefined)
      return fail(`--project needs a value\n${DOMAIN_USAGE}`, 2);
    only = project(v);
  }
  const report = await checkDomains(needDomains(ctx), {
    project: only,
    force: only !== undefined,
  });
  const code = report.failed > 0 ? 1 : 0;
  if (json) return { code, out: `${JSON.stringify(report)}\n`, err: "" };
  const lines = report.changed.map(
    (c) =>
      `${c.project} ${c.host}: ${c.from} → ${c.to}${c.note ? ` (${c.note})` : ""}`,
  );
  lines.push(
    `checked ${report.checked}, changed ${report.changed.length}, failed ${report.failed}`,
  );
  return { code, out: `${lines.join("\n")}\n`, err: "" };
}

export async function domainCommand(
  ctx: DomainContext,
  args: string[],
  json: boolean,
): Promise<Result> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "add":
      return add(ctx, rest);
    case "ls":
      return ls(ctx, rest, json);
    case "rm":
      return rm(ctx, rest);
    case "redirect":
      return setRedirect(ctx, rest);
    case "check":
      return check(ctx, rest, json);
    default:
      return fail(DOMAIN_USAGE, 2);
  }
}
