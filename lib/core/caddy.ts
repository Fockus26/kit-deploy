import {
  CADDY_ACCESS_LOG_SNIPPET,
  CADDY_SITES_DIR,
  PORT_RANGE,
} from "./constants";
import { siteName, type Target } from "./target";
import { assertHost, assertIntInRange, CoreInputError } from "./validate";

export type SiteInput = {
  target: Target;
  /** The hostnames this site answers on (its domains, or its preview host). */
  hosts: readonly string[];
  /** The loopback port of the container serving it now. */
  port: number;
};

export type SiteFile = {
  /** Absolute path on the VPS: `/etc/caddy/sites/<siteName>.caddy`. */
  path: string;
  content: string;
};

/**
 * One Caddy site file. Already in `caddy fmt` form (tabs), so `caddy fmt --overwrite` leaves it
 * byte-identical and kit-agent can compare before rewriting. The same input always renders the
 * same bytes.
 */
export function renderSite(input: SiteInput): SiteFile {
  const name = siteName(input.target);
  const port = assertIntInRange(
    "port",
    input.port,
    PORT_RANGE.min,
    PORT_RANGE.max,
  );
  if (input.hosts.length === 0) {
    throw new CoreInputError(`site "${name}" needs at least one host`);
  }
  const hosts = [
    ...new Set(input.hosts.map((h) => assertHost(h.toLowerCase()))),
  ];

  const content = [
    `# Written by kit-deploy for ${name} — do not edit by hand: \`kit-deploy regenerate\` rewrites it.`,
    `${hosts.join(", ")} {`,
    `\timport ${CADDY_ACCESS_LOG_SNIPPET}`,
    `\treverse_proxy 127.0.0.1:${port}`,
    "}",
    "",
  ].join("\n");

  return { path: `${CADDY_SITES_DIR}/${name}.caddy`, content };
}
