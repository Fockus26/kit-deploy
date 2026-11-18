/**
 * A project's domains (brief F6) for `kit-deploy domain` and the panel's Dominios page. A host is
 * added in `pending_dns`; `domain check` puts it in its Caddy site once its DNS points to the VPS
 * (D028, D029). Production never loses its last host.
 */
import { RESERVED_HOSTS } from "../../agent/protocol";
import { PREVIEW_DOMAIN } from "../core/constants";
import { defaultHost } from "../core/target";
import { assertHost, assertProject, CoreInputError } from "../core/validate";
import { AdminError, type AdminStore } from "../db/admin";
import { DOMAIN_REDIRECTS, type DomainRedirect } from "../db/schema";
import {
  type CheckDeps,
  type CheckReport,
  checkDomains,
} from "../domains/check";
import { redirectTarget } from "../domains/dns";
import { siteHosts } from "../domains/site";
import type { DomainRow } from "../domains/store";

/** Lowercase, a valid name, not the platform's and not under the previews' wildcard. */
export function projectHost(raw: string): string {
  const h = assertHost(raw.toLowerCase());
  if ((RESERVED_HOSTS as readonly string[]).includes(h))
    throw new CoreInputError(`${h} is the platform's`);
  if (h === PREVIEW_DOMAIN || h.endsWith(`.${PREVIEW_DOMAIN}`))
    throw new CoreInputError(`${h} is under ${PREVIEW_DOMAIN}: previews only`);
  return h;
}

/** `to-apex` on the command line, `to_apex` in the database (and the form). */
export function parseRedirect(raw: string): DomainRedirect {
  const r = raw.replace(/-/g, "_");
  if (!(DOMAIN_REDIRECTS as readonly string[]).includes(r))
    throw new CoreInputError(
      `invalid redirect "${raw}": none, to-apex or to-www`,
    );
  return r as DomainRedirect;
}

/** The redirect fits the host, and its target is already a domain of the same project. */
export function checkRedirect(
  rows: readonly DomainRow[],
  h: string,
  r: DomainRedirect,
): void {
  const to = redirectTarget(h, r);
  if (to !== null && !rows.some((d) => d.host === to))
    throw new CoreInputError(
      `${h} would redirect to ${to}, which is not a domain of this project: add it first`,
    );
}

/** Rewrites the project's site file now when it is live; otherwise its next deploy does. */
export async function rewriteSite(
  deps: CheckDeps,
  p: string,
): Promise<"rewritten" | "not_live"> {
  if (!(await deps.liveProjects()).has(p)) return "not_live";
  const res = await deps.regenerate(p);
  if (!res.ok)
    throw new AdminError(
      `${p}: the site file was not rewritten (${res.error ?? "unknown error"}); retry with kit-deploy regenerate`,
    );
  return "rewritten";
}

/**
 * `already`: the host is this project's already (a second submit of the same form): nothing
 * changes. Another project's host is AdminError from the store.
 */
export async function addDomain(
  deps: {
    admin: AdminStore;
    /** Read only when needed: a redirect to check, or `idempotent`. */
    listDomains: (project: string) => Promise<DomainRow[]>;
  },
  input: { project: string; host: string; redirect?: DomainRedirect },
  /** `actor`: who, for the audit row written with the host (D045); none = no row. */
  opts: { idempotent?: boolean; actor?: string } = {},
): Promise<{ host: string; redirect: DomainRedirect; already: boolean }> {
  const p = assertProject(input.project);
  const h = projectHost(input.host);
  const r = input.redirect ?? "none";
  const needRows = r !== "none" || opts.idempotent === true;
  const rows = needRows ? await deps.listDomains(p) : [];
  const existing = rows.find((d) => d.host === h);
  if (opts.idempotent && existing)
    return { host: h, redirect: existing.redirect, already: true };
  if (r !== "none") checkRedirect(rows, h, r);
  await deps.admin.addDomain(
    p,
    h,
    r,
    opts.actor
      ? { actor: opts.actor, action: "domain.add", project: p, name: h }
      : undefined,
  );
  return { host: h, redirect: r, already: false };
}

export type RemoveRefusal = "not_found" | "default" | "last";

export async function removeDomain(
  deps: CheckDeps,
  input: { project: string; host: string },
  opts: { force?: boolean; actor?: string } = {},
): Promise<
  | { ok: true; host: string; site: "rewritten" | "not_live" }
  | { ok: false; host: string; reason: RemoveRefusal }
> {
  const p = assertProject(input.project);
  const h = projectHost(input.host);
  const rows = await deps.store.list(p);
  if (!rows.some((d) => d.host === h))
    return { ok: false, host: h, reason: "not_found" };
  if (h === defaultHost(p) && !opts.force)
    return { ok: false, host: h, reason: "default" };
  // Production must keep answering: never the last host its site serves.
  const before = siteHosts(p, rows).hosts;
  const after = siteHosts(
    p,
    rows.filter((d) => d.host !== h),
  ).hosts;
  if (before.length > 0 && after.length === 0)
    return { ok: false, host: h, reason: "last" };
  const audit = opts.actor
    ? {
        actor: opts.actor,
        action: "domain.remove" as const,
        project: p,
        name: h,
      }
    : undefined;
  if (!(await deps.store.remove(p, h, audit)))
    return { ok: false, host: h, reason: "not_found" };
  return { ok: true, host: h, site: await rewriteSite(deps, p) };
}

export async function setDomainRedirect(
  deps: CheckDeps,
  input: { project: string; host: string; redirect: DomainRedirect },
): Promise<
  | {
      ok: true;
      host: string;
      redirectsTo: string | null;
      site: "rewritten" | "not_live";
    }
  | { ok: false; host: string; reason: "not_found" }
> {
  const p = assertProject(input.project);
  const h = projectHost(input.host);
  const rows = await deps.store.list(p);
  if (!rows.some((d) => d.host === h))
    return { ok: false, host: h, reason: "not_found" };
  checkRedirect(rows, h, input.redirect);
  await deps.store.setRedirect(p, h, input.redirect);
  return {
    ok: true,
    host: h,
    redirectsTo: redirectTarget(h, input.redirect),
    site: await rewriteSite(deps, p),
  };
}

/** Every host of one project now, ready ones included (`domain check --project`, "Comprobar
 * ahora"). */
export function checkProjectDomains(
  deps: CheckDeps,
  project: string,
): Promise<CheckReport> {
  return checkDomains(deps, { project: assertProject(project), force: true });
}
