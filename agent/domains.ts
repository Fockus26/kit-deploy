/**
 * `cert.status` (phase 05, brief F6): the certificate Caddy holds for one host, read from Caddy's
 * own storage (D029). No network, no subprocess: what Caddy will serve is what it stored. Only the
 * leaf's expiry and issuer come back, never the file (the key lives next to it and is never read).
 */
import { X509Certificate } from "node:crypto";
import {
  CADDY_CERT_ISSUERS,
  CADDY_CERTS_DIR,
  DASHBOARD_HOST,
  DB_HOST,
  PREVIEW_DOMAIN,
} from "../lib/core/constants";
import { assertHost } from "../lib/core/validate";
import type { Deps } from "./deps";

export type CertStatus = {
  /** ISO 8601. */
  notAfter: string;
  /** The issuer's organization or common name (`Let's Encrypt`, `ZeroSSL`). */
  issuer: string;
  /** Which ACME directory Caddy got it from. */
  source: (typeof CADDY_CERT_ISSUERS)[number];
};

/** `O=Let's Encrypt\nCN=R11` → `Let's Encrypt`; CN when there is no O. */
function issuerName(issuer: string): string {
  const fields = new Map(
    issuer.split("\n").map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)] as const;
    }),
  );
  return (fields.get("O") ?? fields.get("CN") ?? "unknown").slice(0, 100);
}

/** Far above a leaf plus its chain (a few KiB); a bigger file is not one of Caddy's. */
export const CERT_MAX_BYTES = 64 * 1024;

/** The PEM, as a regular file only (a symlink is never followed) and within the cap; null when
 * there is none or it is not something Caddy wrote — skipped like a file that does not parse. */
async function readCert(deps: Deps, path: string): Promise<string | null> {
  let r: Awaited<ReturnType<Deps["readFileFrom"]>>;
  try {
    r = await deps.readFileFrom(path, 0, CERT_MAX_BYTES);
  } catch {
    // ELOOP (a symlink), a directory, a FIFO: not a certificate.
    return null;
  }
  if (r === null || r.size > CERT_MAX_BYTES) return null;
  return Buffer.from(r.data).toString("utf8");
}

/**
 * The newest valid-for-this-host certificate among the issuers' directories, or null when Caddy
 * has none yet. A file that does not parse or does not cover the host is skipped, not an error:
 * the caller reports "no certificate" and Caddy keeps trying.
 */
export async function certStatus(
  deps: Deps,
  rawHost: string,
): Promise<CertStatus | null> {
  // Validated before it becomes a path: no `/`, no `..`, lowercase labels only.
  const host = assertHost(rawHost.toLowerCase());
  return caddyCert(deps, host, host);
}

/** Caddy's stored certificate under `<issuer>/<dir>/<dir>.crt` that covers `checkName`. */
async function caddyCert(
  deps: Deps,
  dir: string,
  checkName: string,
): Promise<CertStatus | null> {
  let best: { cert: X509Certificate; source: CertStatus["source"] } | null =
    null;
  for (const source of CADDY_CERT_ISSUERS) {
    const pem = await readCert(
      deps,
      `${CADDY_CERTS_DIR}/${source}/${dir}/${dir}.crt`,
    );
    if (pem === null) continue;
    let cert: X509Certificate;
    try {
      // Caddy stores the chain, leaf first; the constructor reads the first certificate.
      cert = new X509Certificate(pem);
    } catch {
      continue;
    }
    if (cert.checkHost(checkName) === undefined) continue;
    if (!best || Date.parse(cert.validTo) > Date.parse(best.cert.validTo))
      best = { cert, source };
  }
  if (!best) return null;
  return {
    notAfter: new Date(Date.parse(best.cert.validTo)).toISOString(),
    issuer: issuerName(best.cert.issuer),
    source: best.source,
  };
}

/** certbot's certificate for db.fockus.dev (PgBouncer's TLS), not Caddy's: losing it cuts every
 * project from its database (CLAUDE.md). Only the public certificate is read, never privkey.pem. */
export const DB_CERT_PATH = `/etc/letsencrypt/live/${DB_HOST}/cert.pem`;

export type PlatformCert = {
  /** `db.fockus.dev`, `deploy.fockus.dev` or `*.preview.fockus.dev`. */
  name: string;
  /** ISO 8601; null when the certificate is not there (yet) or does not parse. */
  notAfter: string | null;
};

/**
 * `platform.certs` (phase 06, brief F10): the certificates no project domain row follows — the
 * database's (certbot), the dashboard's and the previews' wildcard (Caddy). The alerts check
 * warns 14 days before any of them expires.
 */
export async function platformCerts(deps: Deps): Promise<PlatformCert[]> {
  let db: string | null = null;
  const pem = await deps.readFile(DB_CERT_PATH);
  if (pem !== null) {
    try {
      const cert = new X509Certificate(pem);
      if (cert.checkHost(DB_HOST) !== undefined)
        db = new Date(Date.parse(cert.validTo)).toISOString();
    } catch {
      db = null;
    }
  }
  const dashboard = await caddyCert(deps, DASHBOARD_HOST, DASHBOARD_HOST);
  // Caddy names a wildcard's storage `wildcard_.<domain>`.
  const wildcard = `wildcard_.${PREVIEW_DOMAIN}`;
  const previews = await caddyCert(
    deps,
    wildcard,
    `kit-probe.${PREVIEW_DOMAIN}`,
  );
  return [
    { name: DB_HOST, notAfter: db },
    { name: DASHBOARD_HOST, notAfter: dashboard?.notAfter ?? null },
    { name: `*.${PREVIEW_DOMAIN}`, notAfter: previews?.notAfter ?? null },
  ];
}
