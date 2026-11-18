/**
 * Which of a project's domains go into its Caddy site, and how (D028). Pure: the switch's repo
 * reads the rows and the site file is rendered from this.
 *
 * - A host is served once its DNS has resolved to the VPS (`dnsOkAt`), so Caddy never asks
 *   Let's Encrypt for a host that is not pointed yet (failed HTTP-01s count against the rate
 *   limit). The project's default `<project>.fockus.dev` is always served, as before.
 * - A host with a redirect answers with a 308 to its sibling only when that sibling is served
 *   itself; until then it serves the site, so production keeps answering on it.
 */
import type { Redirect } from "../core/caddy";
import { defaultHost } from "../core/target";
import type { DomainRedirect } from "../db/schema";
import { redirectTarget } from "./dns";

export type SiteDomain = {
  host: string;
  redirect: DomainRedirect;
  dnsOkAt: Date | null;
};

export type SiteHosts = { hosts: string[]; redirects: Redirect[] };

function targetOf(d: SiteDomain): string | null {
  try {
    return redirectTarget(d.host, d.redirect);
  } catch {
    // A row the database let through with a redirect that does not fit its host: serve it.
    return null;
  }
}

export function siteHosts(
  project: string,
  rows: readonly SiteDomain[],
): SiteHosts {
  const always = defaultHost(project);
  const served = rows.filter((r) => r.dnsOkAt !== null || r.host === always);
  const direct = new Set(
    served.filter((r) => targetOf(r) === null).map((r) => r.host),
  );
  const redirects: Redirect[] = [];
  const fallback: string[] = [];
  for (const r of served) {
    const to = targetOf(r);
    if (to === null) continue;
    if (direct.has(to)) redirects.push({ from: r.host, to });
    else fallback.push(r.host);
  }
  const hosts = [...direct, ...fallback].sort();
  redirects.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return { hosts, redirects };
}
