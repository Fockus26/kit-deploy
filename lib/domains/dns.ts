/**
 * What a domain needs at its DNS provider, as data: `kit-deploy domain ls` prints it and the
 * dashboard's domains page (phase 05) renders it. And the one rule that decides when a host has
 * been pointed: its A records are the VPS and nothing else, and it has no AAAA elsewhere (D028).
 */
import { PROJECT_DOMAIN, VPS_IPV4, VPS_IPV6 } from "../core/constants";
import { assertHost, CoreInputError } from "../core/validate";
import type { DomainRedirect } from "../db/schema";

/**
 * Second-level suffixes under which a registrable domain has three labels (`tienda.com.mx`). Not
 * the whole Public Suffix List: the ones a client of César's is likely to bring. Anything else is
 * read as `<name>.<tld>`; a wrong guess only changes the record's name shown, never what is
 * checked (the check resolves the full host).
 */
export const SECOND_LEVEL_SUFFIXES = [
  "com.mx",
  "org.mx",
  "net.mx",
  "edu.mx",
  "gob.mx",
  "com.ar",
  "com.br",
  "com.co",
  "com.pe",
  "com.ve",
  "com.ec",
  "com.uy",
  "com.es",
  "co.uk",
  "org.uk",
] as const;

export type DnsRecord = {
  type: "A";
  /** Relative to the zone: `@` for the apex, else the labels before it (`www`, `app.eu`). */
  name: string;
  value: string;
  /** Always DNS-only (grey cloud on Cloudflare, D001): a proxy would answer with its own IPs. */
  proxied: false;
};

export type DnsInstructions = {
  host: string;
  /** The registrable domain the records are created in (`example.com`). */
  zone: string;
  /** Empty when `coveredBy` already points it. */
  records: DnsRecord[];
  /** Record types that must not exist for this name: an AAAA elsewhere breaks HTTP-01. */
  mustNotExist: Array<"AAAA">;
  /** `*.fockus.dev` (D020): nothing to create. */
  coveredBy: string | null;
  /** The sibling it redirects to (`to_apex` / `to_www`), or null. */
  redirectsTo: string | null;
};

/** `www.tienda.com.mx` → `tienda.com.mx`. */
export function zoneOf(rawHost: string): string {
  const host = assertHost(rawHost.toLowerCase());
  const labels = host.split(".");
  const two = labels.slice(-2).join(".");
  const take = (SECOND_LEVEL_SUFFIXES as readonly string[]).includes(two)
    ? 3
    : 2;
  return labels.slice(-take).join(".");
}

export function isApex(host: string): boolean {
  return zoneOf(host) === host.toLowerCase();
}

/**
 * The host a redirect sends to, or null for `none`. `to_apex` only on `www.<apex>`, `to_www` only
 * on an apex; anything else is a CoreInputError.
 */
export function redirectTarget(
  rawHost: string,
  redirect: DomainRedirect,
): string | null {
  const host = assertHost(rawHost.toLowerCase());
  if (redirect === "none") return null;
  if (redirect === "to_apex") {
    const apex = host.slice(4);
    if (!host.startsWith("www.") || zoneOf(host) !== apex) {
      throw new CoreInputError(
        `${host}: to-apex is only for www.<domain> (www.example.com → example.com)`,
      );
    }
    return apex;
  }
  if (!isApex(host)) {
    throw new CoreInputError(
      `${host}: to-www is only for a domain's apex (example.com → www.example.com)`,
    );
  }
  return `www.${host}`;
}

/** Whether the host sits under the platform's wildcard (`<x>.fockus.dev`, one level). */
function wildcardCovers(host: string): boolean {
  const suffix = `.${PROJECT_DOMAIN}`;
  return host.endsWith(suffix) && !host.slice(0, -suffix.length).includes(".");
}

export function dnsInstructions(
  rawHost: string,
  redirect: DomainRedirect = "none",
): DnsInstructions {
  const host = assertHost(rawHost.toLowerCase());
  const redirectsTo = redirectTarget(host, redirect);
  if (wildcardCovers(host)) {
    return {
      host,
      zone: PROJECT_DOMAIN,
      records: [],
      mustNotExist: [],
      coveredBy: `*.${PROJECT_DOMAIN}`,
      redirectsTo,
    };
  }
  const zone = zoneOf(host);
  const name = host === zone ? "@" : host.slice(0, -(zone.length + 1));
  return {
    host,
    zone,
    records: [{ type: "A", name, value: VPS_IPV4, proxied: false }],
    mustNotExist: VPS_IPV6 === null ? ["AAAA"] : [],
    coveredBy: null,
    redirectsTo,
  };
}

/** One line per record, for the CLI: `A @ 178.238.238.7 (DNS only) in example.com; no AAAA`. */
export function describeInstructions(i: DnsInstructions): string {
  if (i.coveredBy) return `covered by ${i.coveredBy}`;
  const records = i.records
    .map((r) => `${r.type} ${r.name} ${r.value} (DNS only)`)
    .join(", ");
  const none = i.mustNotExist.length
    ? `; no ${i.mustNotExist.join("/")} record`
    : "";
  return `${records} in ${i.zone}${none}`;
}

export type Resolved = { a: string[]; aaaa: string[] };

/**
 * Pointed = at least one A, every A is the VPS, and every AAAA is the VPS' (none while it has no
 * IPv6). Returns null when pointed, else the reason in one short sentence.
 */
export function dnsProblem(r: Resolved): string | null {
  if (r.a.length === 0) return `no A record (expected ${VPS_IPV4})`;
  const elsewhere = r.a.filter((ip) => ip !== VPS_IPV4);
  if (elsewhere.length > 0)
    return `A resolves to ${elsewhere.slice(0, 3).join(", ")}, not ${VPS_IPV4}`;
  const aaaa = r.aaaa.filter((ip) => ip !== VPS_IPV6);
  if (aaaa.length > 0)
    return `AAAA ${aaaa.slice(0, 2).join(", ")} must be removed (the VPS has no IPv6)`;
  return null;
}
