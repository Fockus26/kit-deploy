/**
 * `cert.status` (phase 05, brief F6): the certificate Caddy holds for one host, read from Caddy's
 * own storage (D029). No network, no subprocess: what Caddy will serve is what it stored. Only the
 * leaf's expiry and issuer come back, never the file (the key lives next to it and is never read).
 */
import { X509Certificate } from "node:crypto";
import { CADDY_CERT_ISSUERS, CADDY_CERTS_DIR } from "../lib/core/constants";
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
  let best: { cert: X509Certificate; source: CertStatus["source"] } | null =
    null;
  for (const source of CADDY_CERT_ISSUERS) {
    const pem = await deps.readFile(
      `${CADDY_CERTS_DIR}/${source}/${host}/${host}.crt`,
    );
    if (pem === null) continue;
    let cert: X509Certificate;
    try {
      // Caddy stores the chain, leaf first; the constructor reads the first certificate.
      cert = new X509Certificate(pem);
    } catch {
      continue;
    }
    if (cert.checkHost(host) === undefined) continue;
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
