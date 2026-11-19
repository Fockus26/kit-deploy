import {
  CADDY_ACCESS_LOG_SNIPPET,
  CADDY_PREVIEW_ASLEEP_SNIPPET,
  CADDY_PREVIEW_SNIPPET,
  CADDY_PREVIEWS_DIR,
  CADDY_SITES_DIR,
  PORT_RANGE,
  PREVIEW_DOMAIN,
  UPSTREAM_KEEPALIVE,
} from "./constants";
import { previewHost, siteName, type Target } from "./target";
import { assertHost, assertIntInRange, CoreInputError } from "./validate";

export type SiteInput = {
  /** A production target: previews only ever go through `renderPreviewSite`. */
  target: Target;
  /** The hostnames this site answers on (its domains). */
  hosts: readonly string[];
  /** The loopback port of the container serving it now. */
  port: number;
  /** Hosts that only answer with a 308 to one of `hosts` (`www` ↔ apex, D028). */
  redirects?: readonly Redirect[];
};

/** `from` gets a site block of its own that sends every request to `https://<to>` + its URI. */
export type Redirect = { from: string; to: string };

export type SiteFile = {
  /** Absolute path on the VPS: `/etc/caddy/sites/<siteName>.caddy` or
   * `/etc/caddy/previews/<siteName>.caddy`. */
  path: string;
  content: string;
};

function assertPort(port: number): number {
  return assertIntInRange("port", port, PORT_RANGE.min, PORT_RANGE.max);
}

/** A host under the preview wildcard (or the wildcard's own name). */
function isUnderPreviewDomain(host: string): boolean {
  return host === PREVIEW_DOMAIN || host.endsWith(`.${PREVIEW_DOMAIN}`);
}

/**
 * Each redirect's source is a host of its own (not one of `hosts`, not a preview, once) and its
 * target one of the hosts this same site serves: a site file never sends traffic to a host it
 * does not answer for. Sorted, so the same set renders the same bytes.
 */
function assertRedirects(
  name: string,
  hosts: readonly string[],
  redirects: readonly Redirect[],
): Redirect[] {
  const seen = new Set<string>();
  const out = redirects.map((r) => {
    const from = assertHost(r.from.toLowerCase());
    const to = assertHost(r.to.toLowerCase());
    if (isUnderPreviewDomain(from)) {
      throw new CoreInputError(
        `host "${from}" is under ${PREVIEW_DOMAIN}: previews are served only behind the login`,
      );
    }
    if (hosts.includes(from) || seen.has(from)) {
      throw new CoreInputError(
        `site "${name}": "${from}" is listed twice (a host either serves or redirects)`,
      );
    }
    if (!hosts.includes(to)) {
      throw new CoreInputError(
        `site "${name}": "${from}" redirects to "${to}", which this site does not serve`,
      );
    }
    seen.add(from);
    return { from, to };
  });
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/**
 * One Caddy site file. Already in `caddy fmt` form (tabs), so `caddy fmt --overwrite` leaves it
 * byte-identical and kit-agent can compare before rewriting. The same input always renders the
 * same bytes.
 *
 * Production only: a site block of its own for a preview host would answer outside the wildcard
 * and its `kit_preview` gate, with no login (D013).
 */
export function renderSite(input: SiteInput): SiteFile {
  const name = siteName(input.target);
  if (input.target.env !== "production") {
    throw new CoreInputError(
      `site "${name}" is a preview: its file is renderPreviewSite's, behind the login`,
    );
  }
  const port = assertPort(input.port);
  if (input.hosts.length === 0) {
    throw new CoreInputError(`site "${name}" needs at least one host`);
  }
  const hosts = [
    ...new Set(input.hosts.map((h) => assertHost(h.toLowerCase()))),
  ];
  const preview = hosts.find(isUnderPreviewDomain);
  if (preview) {
    throw new CoreInputError(
      `host "${preview}" is under ${PREVIEW_DOMAIN}: previews are served only behind the login`,
    );
  }
  const redirects = assertRedirects(name, hosts, input.redirects ?? []);

  const content = [
    `# Written by kit-deploy for ${name} — do not edit by hand: \`kit-deploy regenerate\` rewrites it.`,
    `${hosts.join(", ")} {`,
    `\timport ${CADDY_ACCESS_LOG_SNIPPET}`,
    `\treverse_proxy 127.0.0.1:${port} {`,
    "\t\ttransport http {",
    `\t\t\tkeepalive ${UPSTREAM_KEEPALIVE}`,
    "\t\t}",
    "\t}",
    "}",
    ...redirects.flatMap((r) => [
      "",
      `${r.from} {`,
      `\tredir https://${r.to}{uri} 308`,
      "}",
    ]),
    "",
  ].join("\n");

  return { path: `${CADDY_SITES_DIR}/${name}.caddy`, content };
}

/** A running preview proxies to its container; a sleeping one (D017) answers with the
 * "preview dormido" page, with no proxy. Both behind the same `kit_preview` gate. */
export type PreviewSiteInput = { project: string; pr: number } & (
  | { state: "running"; port: number }
  | { state: "asleep" }
);

/**
 * One preview's file in `/etc/caddy/previews/`, imported inside the wildcard site
 * (`infra/caddy/kit-previews.caddy`): a host matcher and its handle. The handle is only ever
 * an import of one of that site's snippets, which put the exchange and `forward_auth` before
 * anything else, so no preview is ever served without the login (D013). The host comes from
 * `previewHost`, never from the caller. `caddy fmt` form, deterministic, like `renderSite`.
 */
export function renderPreviewSite(input: PreviewSiteInput): SiteFile {
  const target: Target = {
    project: input.project,
    env: "preview",
    pr: input.pr,
  };
  const name = siteName(target);
  const host = assertHost(previewHost(input.project, input.pr));
  let body: string;
  switch (input.state) {
    case "running":
      body = `import ${CADDY_PREVIEW_SNIPPET} 127.0.0.1:${assertPort(input.port)}`;
      break;
    case "asleep":
      body = `import ${CADDY_PREVIEW_ASLEEP_SNIPPET} ${input.project} ${input.pr}`;
      break;
    default:
      throw new CoreInputError(
        `invalid preview state "${String((input as { state: unknown }).state)}"`,
      );
  }

  const content = [
    `# Written by kit-deploy for ${name} (${input.state}) — do not edit by hand.`,
    `@${name} host ${host}`,
    `handle @${name} {`,
    `\t${body}`,
    "}",
    "",
  ].join("\n");

  return { path: `${CADDY_PREVIEWS_DIR}/${name}.caddy`, content };
}
