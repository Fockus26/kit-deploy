/** Fixed facts of the platform. The VPS side of each one lives in `infra/server-ready.sh`. */

/** D016: every container publishes one loopback port in this range. */
export const PORT_RANGE = { min: 20000, max: 29999 } as const;

/** The port the app listens on inside its container (`templates/Dockerfile`, Next standalone). */
export const CONTAINER_PORT = 3000;

/** Where the base Caddyfile imports site files from (`import sites/*.caddy`). */
export const CADDY_SITES_DIR = "/etc/caddy/sites";

/** Each preview's file (a host matcher + its handle), imported inside the wildcard site
 * `infra/caddy/kit-previews.caddy`. */
export const CADDY_PREVIEWS_DIR = "/etc/caddy/previews";

/** The wildcard site that imports the previews' files; without it a preview file is never served. */
export const CADDY_PREVIEWS_SITE = `${CADDY_SITES_DIR}/kit-previews.caddy`;

/** The snippets `infra/caddy/kit-previews.caddy` defines. A running preview's handle is only
 * `import kit_preview 127.0.0.1:<port>` (exchange, forward_auth, then the app, D013); a sleeping
 * one's is `import kit_preview_asleep <project> <pr>` (the same gate, then the D017 page). */
export const CADDY_PREVIEW_SNIPPET = "kit_preview";
export const CADDY_PREVIEW_ASLEEP_SNIPPET = "kit_preview_asleep";

/** The snippet the base Caddyfile defines: one JSON access log for metrics (D015) and logs (D014). */
export const CADDY_ACCESS_LOG_SNIPPET = "kit_access_log";

/** How long Caddy keeps an idle connection to an app before closing it itself. Caddy's default is
 * 2 min, while Node (Next standalone without KEEP_ALIVE_TIMEOUT) closes idle sockets at 5 s: Caddy
 * then reuses a socket the app just closed, and a non-idempotent request (a form POST, a Server
 * Action) gets a 502 — Caddy's docs warn about exactly this. Below the app's timeout, Caddy always
 * closes first. Same value in `infra/caddy/kit-previews.caddy` and `infra/update.sh`. */
export const UPSTREAM_KEEPALIVE = "4s";

/** The central Postgres' host: containers resolve it to the VPS itself (brief, Architecture). */
export const DB_HOST = "db.fockus.dev";

/** D001: previews live under one wildcard. */
export const PREVIEW_DOMAIN = "preview.fockus.dev";

/** D017: production 256–512 MB, previews 384 MB. The bounds a caller may ask for. */
export const MEMORY_MB = { min: 128, max: 2048, preview: 384 } as const;

/** Previews running at once per project (D017): a fifth puts the least recently pushed to sleep. */
export const PREVIEW_LIMIT = 4;

/** Same limits as `daemon.json`, set per container so they hold even if the default changes. */
export const LOG_OPTS = { maxSize: "10m", maxFile: 3 } as const;

/** The non-root user of the Next standalone image (`nextjs`, uid/gid 1001). */
export const APP_USER = "1001:1001";

/** Label every container kit-deploy creates carries: the agent only stops/removes those. */
export const MANAGED_LABEL = "dev.fockus.kit-deploy";

/** A project without its own domain answers on `<project>.fockus.dev` (César, 2026-11-12). */
export const PROJECT_DOMAIN = "fockus.dev";

/** Subdomains of fockus.dev that are the platform's, never a project's default host. */
export const RESERVED_SUBDOMAINS = ["db", "deploy", "preview", "www"] as const;

/** The dashboard's own host (D001); its session cookie never leaves it (D013). */
export const DASHBOARD_HOST = "deploy.fockus.dev";

/** The VPS' public address (D001, D020): what a project's domain must resolve to before its host
 * goes into Caddy. The wildcard `*.fockus.dev` already points here. */
export const VPS_IPV4 = "178.238.238.7";

/** The VPS publishes no IPv6 address. An AAAA record elsewhere makes Let's Encrypt validate over
 * IPv6 at the wrong machine, so a host with any AAAA does not count as pointed (D028). */
export const VPS_IPV6: string | null = null;

/** Where Caddy (user `caddy`, home /var/lib/caddy, no XDG override) keeps the certificates it
 * obtains: `<dir>/<issuer>/<host>/<host>.crt` (D029). */
export const CADDY_CERTS_DIR = "/var/lib/caddy/.local/share/caddy/certificates";

/** The ACME issuers Caddy uses by default, in its order: Let's Encrypt, then ZeroSSL. */
export const CADDY_CERT_ISSUERS = [
  "acme-v02.api.letsencrypt.org-directory",
  "acme.zerossl.com-v2-dv90",
] as const;
