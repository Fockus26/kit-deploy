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

/** The snippet the base Caddyfile defines: one JSON access log for metrics (D015) and logs (D014). */
export const CADDY_ACCESS_LOG_SNIPPET = "kit_access_log";

/** The central Postgres' host: containers resolve it to the VPS itself (brief, Architecture). */
export const DB_HOST = "db.fockus.dev";

/** D001: previews live under one wildcard. */
export const PREVIEW_DOMAIN = "preview.fockus.dev";

/** D017: production 256–512 MB, previews 384 MB. The bounds a caller may ask for. */
export const MEMORY_MB = { min: 128, max: 2048, preview: 384 } as const;

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
