/**
 * The closed list of operations. Each one takes an already-validated request and does its
 * work only through `Deps`. Containers are only stopped or removed when Docker itself says they
 * carry kit-deploy's label — never gaby, evolution_* or anything else on the VPS.
 */
import {
  allocatePort,
  CADDY_PREVIEW_ASLEEP_SNIPPET,
  CADDY_PREVIEW_SNIPPET,
  CADDY_PREVIEWS_DIR,
  CADDY_PREVIEWS_SITE,
  CADDY_SITES_DIR,
  containerName,
  dockerRunArgs,
  MANAGED_LABEL,
  PREVIEW_DOMAIN,
  type PreviewSiteInput,
  renderPreviewSite,
  renderSite,
  type SiteFile,
  siteName,
  type Target,
} from "../lib/core";
import {
  deriveEnvKey,
  EnvCryptoError,
  open,
  type Sealed,
  seal,
} from "../lib/core/crypto";
import {
  assertEnvName,
  assertEnvValue,
  assertSecretFlag,
  type Environment,
} from "../lib/core/env";
import { assertImage } from "../lib/core/validate";
import type { Deps, RunResult } from "./deps";
import { AGENT_VERSION, type ErrorCode, type Request } from "./protocol";

export const CADDYFILE = "/etc/caddy/Caddyfile";
/** Caddy's Cloudflare token (DNS-01 for `*.preview`), the file the caddy unit reads as its
 * EnvironmentFile. Once the previews site exists, `caddy validate` provisions the DNS provider and
 * fails without it, so every site and preview write needs it in validate's env (2026-11-17). */
export const CLOUDFLARE_ENV = "/etc/caddy/cloudflare.env";
const CF_TOKEN = /^[A-Za-z0-9_-]{20,}$/;

/** The token from cloudflare.env, read as data (never sourced); `null` when absent or malformed. */
export function cloudflareToken(text: string | null): string | null {
  if (text === null) return null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("CLOUDFLARE_API_TOKEN=")) continue;
    const v = line.slice("CLOUDFLARE_API_TOKEN=".length).trim();
    return CF_TOKEN.test(v) ? v : null;
  }
  return null;
}
/** Root 0400, written once by server-ready.sh (D012). Only this process reads it (D011). */
export const MASTER_KEY = "/etc/kit-deploy/master.key";
/** Root 0700, not under /run/kit-deploy (which the web container mounts). A file lives here only
 * for the length of one `docker run`; Docker keeps the variables in its root-only config. */
export const ENV_FILES_DIR = "/run/kit-agent/env";

const PULL_TIMEOUT_MS = 600_000;
const HEALTH_TIMEOUT_MS = 3_000;
/** A port handed out by `ports.allocate` stays reserved this long, so two deploys that allocate
 * before either has started its container do not get the same one. */
export const RESERVATION_MS = 10 * 60_000;

/** The only files preview.write/remove touch: `/etc/caddy/previews/<project>-pr-<n>.caddy`. */
const PREVIEW_FILE = new RegExp(
  `^${CADDY_PREVIEWS_DIR.replaceAll("/", "\\/")}\\/(([a-z0-9][a-z0-9_]{0,39})-pr-([1-9][0-9]{0,5}))\\.caddy$`,
);

/** Second check after the renderer: the path is exactly one preview file (no traversal, no other
 * directory), and the content is exactly its own matcher plus one import of the login-gated
 * snippets (`infra/caddy/kit-previews.caddy`). */
export function assertPreviewFile(file: SiteFile): SiteFile {
  const m = PREVIEW_FILE.exec(file.path);
  const lines = file.content.split("\n");
  const [, name, project, pr] = m ?? [];
  const handle = lines[3] ?? "";
  const ok =
    m !== null &&
    lines.length === 6 &&
    lines[0]?.startsWith(`# Written by kit-deploy for ${name} (`) &&
    !/[{}]/.test(lines[0]) &&
    lines[1] ===
      `@${name} host ${name?.replaceAll("_", "-")}.${PREVIEW_DOMAIN}` &&
    lines[2] === `handle @${name} {` &&
    (handle === `\timport ${CADDY_PREVIEW_ASLEEP_SNIPPET} ${project} ${pr}` ||
      new RegExp(
        `^\\timport ${CADDY_PREVIEW_SNIPPET} 127\\.0\\.0\\.1:[0-9]{5}$`,
      ).test(handle)) &&
    lines[4] === "}" &&
    lines[5] === "";
  if (!ok) {
    throw new AgentError(
      "bad_request",
      `refusing to write ${JSON.stringify(file.path)}: not a preview file`,
    );
  }
  return file;
}

export class AgentError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

/** The end of a command's stderr: enough to see why it failed, bounded for the response. */
function tail(text: string, max = 1000): string {
  const t = text.trim();
  return t.length > max ? `…${t.slice(-max)}` : t;
}

async function must(
  deps: Deps,
  argv: readonly string[],
  what: string,
  opts?: { timeoutMs?: number },
): Promise<RunResult> {
  const r = await deps.run(argv, opts);
  if (r.code !== 0) {
    throw new AgentError(
      "command_failed",
      `${what} failed (exit ${r.code}): ${tail(r.stderr)}`,
    );
  }
  return r;
}

/** Local ports of every listening TCP socket in `ss -Hltn` output, on any address: a port taken
 * on 0.0.0.0 or :: cannot be bound on 127.0.0.1 either. */
export function parseListeningPorts(ssOutput: string): Set<number> {
  const ports = new Set<number>();
  for (const line of ssOutput.split("\n")) {
    const local = line.trim().split(/\s+/)[3];
    if (!local) continue;
    const port = Number(local.slice(local.lastIndexOf(":") + 1));
    if (Number.isInteger(port) && port > 0) ports.add(port);
  }
  return ports;
}

export type ManagedContainer = {
  name: string;
  state: string;
  image: string;
  site: string;
  project: string;
  env: string;
  sha: string;
  port: number | null;
};

const LIST_FIELDS = ["site", "project", "env", "sha", "port"] as const;
const LIST_FORMAT = [
  "{{.Names}}",
  "{{.State}}",
  "{{.Image}}",
  ...LIST_FIELDS.map((f) => `{{.Label "${MANAGED_LABEL}.${f}"}}`),
].join("\t");

export function parseContainerList(stdout: string): ManagedContainer[] {
  return stdout
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((line) => {
      const [name, state, image, site, project, env, sha, port] =
        line.split("\t");
      const p = Number(port);
      return {
        name: name ?? "",
        state: state ?? "",
        image: image ?? "",
        site: site ?? "",
        project: project ?? "",
        env: env ?? "",
        sha: sha ?? "",
        port: Number.isInteger(p) && p > 0 ? p : null,
      };
    });
}

export class Agent {
  private readonly reserved = new Map<number, number>();
  /** Derived from master.key on first use; never leaves this process. */
  private envKey: Buffer | null = null;
  /** Mutations run one at a time: two deploys never interleave a site file or a port. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly deps: Deps,
    private readonly now: () => number = Date.now,
  ) {}

  execute(req: Request): Promise<unknown> {
    switch (req.op) {
      case "version":
        return Promise.resolve({ version: AGENT_VERSION });
      case "image.pull":
        return this.pull(req.params.image);
      case "container.list":
        return this.list(req.params.project);
      case "health.check":
        return this.health(req.params.port, req.params.path);
      case "ports.allocate":
        return this.serial(() =>
          this.allocate(req.params.target, req.params.sha),
        );
      case "container.run":
        return this.serial(() => this.runContainer(req.params));
      case "container.stop":
        return this.serial(() =>
          this.stop(req.params.name, req.params.timeoutS),
        );
      case "container.remove":
        return this.serial(() => this.remove(req.params.name));
      case "container.start":
        return this.serial(() => this.start(req.params.name));
      case "site.write":
        return this.serial(() =>
          this.writeSite(req.params.target, req.params.hosts, req.params.port),
        );
      case "site.remove":
        return this.serial(() => this.removeSite(req.params.target));
      case "preview.write":
        return this.serial(() => this.writePreview(req.params));
      case "preview.remove":
        return this.serial(() =>
          this.removePreview(req.params.project, req.params.pr),
        );
      case "preview.list":
        return this.listPreviews();
      case "env.seal":
        return this.sealVar(req.params);
      case "env.reveal":
        return this.revealVars(req.params);
    }
  }

  private async key(): Promise<Buffer> {
    if (this.envKey) return this.envKey;
    const text = await this.deps.readFile(MASTER_KEY);
    if (text === null) {
      throw new AgentError(
        "invalid_config",
        `${MASTER_KEY} is missing: run infra/server-ready.sh`,
      );
    }
    try {
      this.envKey = deriveEnvKey(text);
    } catch {
      // Never the file's content in a message.
      throw new AgentError("invalid_config", `${MASTER_KEY} is malformed`);
    }
    return this.envKey;
  }

  /** A value someone sets (CLI stdin, dashboard field) → the blob its row stores. Only settable
   * names: the managed ones (DATABASE_URL, …) are the agent's own. */
  private async sealVar(p: {
    project: string;
    environment: Environment;
    name: string;
    secret: boolean;
    value: string;
  }): Promise<Sealed> {
    assertEnvName(p.name);
    assertSecretFlag(p.name, p.secret);
    assertEnvValue(p.value);
    const slot = {
      project: p.project,
      environment: p.environment,
      name: p.name,
      secret: p.secret,
    };
    return seal(await this.key(), slot, p.value);
  }

  /**
   * Values back, under the one rule of phase 04: a plain variable (any environment), or anything
   * in Development (`env pull`). A Production/Preview secret is refused before anything is
   * opened; and since `secret` is in the AAD, a caller that calls it plain gets nothing either.
   */
  private async revealVars(p: {
    project: string;
    environment: Environment;
    vars: { name: string; secret: boolean; sealed: Sealed }[];
  }): Promise<{ name: string; value: string }[]> {
    const seen = new Set<string>();
    for (const v of p.vars) {
      assertEnvName(v.name);
      if (seen.has(v.name)) {
        throw new AgentError("bad_request", `${v.name} appears twice`);
      }
      seen.add(v.name);
      if (v.secret && p.environment !== "development") {
        throw new AgentError(
          "forbidden",
          `${v.name} is a secret in ${p.environment}: its value is never returned`,
        );
      }
    }
    const key = await this.key();
    return p.vars.map((v) => {
      const slot = {
        project: p.project,
        environment: p.environment,
        name: v.name,
        secret: v.secret,
      };
      try {
        return { name: v.name, value: open(key, slot, v.sealed) };
      } catch (e) {
        if (e instanceof EnvCryptoError) {
          throw new AgentError("bad_request", `${v.name} cannot be decrypted`);
        }
        throw e;
      }
    });
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async pull(image: string) {
    await must(
      this.deps,
      ["docker", "pull", assertImage(image)],
      "docker pull",
      {
        timeoutMs: PULL_TIMEOUT_MS,
      },
    );
    return { image };
  }

  private async list(project?: string): Promise<ManagedContainer[]> {
    const argv = [
      "docker",
      "ps",
      "--all",
      "--no-trunc",
      `--filter=label=${MANAGED_LABEL}=1`,
    ];
    if (project)
      argv.push(`--filter=label=${MANAGED_LABEL}.project=${project}`);
    argv.push(`--format=${LIST_FORMAT}`);
    const r = await must(this.deps, argv, "docker ps");
    return parseContainerList(r.stdout);
  }

  private async health(port: number, path = "/api/health") {
    const url = `http://127.0.0.1:${port}${path}`;
    try {
      const { status } = await this.deps.httpGet(url, HEALTH_TIMEOUT_MS);
      return { ok: status >= 200 && status < 300, status };
    } catch (e) {
      return { ok: false, status: null, error: (e as Error).message };
    }
  }

  private async allocate(target: Target, sha: string) {
    const name = containerName(target, sha);
    const ss = await must(this.deps, ["ss", "-H", "-l", "-t", "-n"], "ss");
    const used = parseListeningPorts(ss.stdout);
    // Stopped containers keep their port: a rollback restarts one without a new allocation.
    for (const c of await this.list()) if (c.port) used.add(c.port);
    const now = this.now();
    for (const [p, until] of this.reserved) {
      if (until > now) used.add(p);
      else this.reserved.delete(p);
    }
    const port = allocatePort(name, used);
    this.reserved.set(port, now + RESERVATION_MS);
    return { name, port };
  }

  private async runContainer(
    params: Extract<Request, { op: "container.run" }>["params"],
  ) {
    const name = containerName(params.target, params.sha);
    const { vars, ...run } = params;
    // Everything is opened before anything is written or started: one bad row, no container.
    const content =
      vars && vars.length > 0
        ? await this.envFileContent(
            params.target.project,
            params.target.env,
            vars,
          )
        : null;
    const envFile =
      content === null ? undefined : `${ENV_FILES_DIR}/${name}.env`;
    try {
      if (envFile !== undefined && content !== null) {
        await this.deps.writePrivateFile(envFile, content);
      }
      const argv = ["docker", ...dockerRunArgs({ ...run, envFile })];
      const r = await must(this.deps, argv, "docker run");
      this.reserved.delete(params.port);
      return { name, id: r.stdout.trim() };
    } finally {
      if (envFile !== undefined) await this.deps.removeFile(envFile);
    }
  }

  /** `NAME=value` lines for Docker's --env-file. Secrets too: this is where they are for. */
  private async envFileContent(
    project: string,
    environment: Environment,
    vars: { name: string; secret: boolean; sealed: Sealed }[],
  ): Promise<string> {
    const key = await this.key();
    const seen = new Set<string>();
    const lines = vars.map((v) => {
      assertEnvName(v.name);
      if (seen.has(v.name)) {
        throw new AgentError("bad_request", `${v.name} appears twice`);
      }
      seen.add(v.name);
      const slot = { project, environment, name: v.name, secret: v.secret };
      let value: string;
      try {
        value = open(key, slot, v.sealed);
      } catch (e) {
        if (e instanceof EnvCryptoError) {
          throw new AgentError("bad_request", `${v.name} cannot be decrypted`);
        }
        throw e;
      }
      // Sealed values are one line already; checked again before it becomes a line of a file.
      assertEnvValue(value);
      return `${v.name}=${value}
`;
    });
    return lines.join("");
  }

  /** Docker's own record decides: the name pattern is not enough, anyone could name a container so. */
  private async assertManaged(name: string): Promise<void> {
    const r = await this.deps.run([
      "docker",
      "inspect",
      "--type=container",
      `--format={{index .Config.Labels "${MANAGED_LABEL}"}}`,
      name,
    ]);
    if (r.code !== 0 || r.stdout.trim() !== "1") {
      throw new AgentError(
        "not_managed",
        `container ${name} is not managed by kit-deploy`,
      );
    }
  }

  private async stop(name: string, timeoutS = 10) {
    await this.assertManaged(name);
    await must(
      this.deps,
      ["docker", "stop", `--time=${timeoutS}`, name],
      "docker stop",
    );
    return { name };
  }

  /** A kept container back up (rollback, regenerate): same image, port and limits it was run with. */
  private async start(name: string) {
    await this.assertManaged(name);
    await must(this.deps, ["docker", "start", name], "docker start");
    return { name };
  }

  private async remove(name: string) {
    await this.assertManaged(name);
    // No --force: a running container is stopped first, on purpose, by the caller.
    await must(this.deps, ["docker", "rm", name], "docker rm");
    return { name };
  }

  /** Validate the whole config with the new file in place; on any failure put the previous one back. */
  private async applySiteChange(
    path: string,
    previous: string | null,
    change: () => Promise<void>,
  ): Promise<void> {
    const restore = () =>
      previous === null
        ? this.deps.removeFile(path)
        : this.deps.writeFileAtomic(path, previous);
    await change();
    // Only validate provisions modules in this process; reload hands the config to the running
    // Caddy, which has the token from its own unit. The token is never logged or returned.
    const token = cloudflareToken(await this.deps.readFile(CLOUDFLARE_ENV));
    const v = await this.deps.run(
      ["caddy", "validate", `--config=${CADDYFILE}`, "--adapter=caddyfile"],
      token ? { env: { CLOUDFLARE_API_TOKEN: token } } : undefined,
    );
    if (v.code !== 0) {
      await restore();
      // The cloudflare module echoes a token it judges malformed: never let it into the error,
      // which ends in logs and the GitHub status.
      const stderr = token
        ? v.stderr.replaceAll(token, "[redacted]")
        : v.stderr;
      throw new AgentError(
        "invalid_config",
        `caddy validate failed: ${tail(stderr)}`,
      );
    }
    const r = await this.deps.run([
      "caddy",
      "reload",
      `--config=${CADDYFILE}`,
      "--adapter=caddyfile",
    ]);
    if (r.code !== 0) {
      await restore();
      throw new AgentError(
        "command_failed",
        `caddy reload failed: ${tail(r.stderr)}`,
      );
    }
  }

  private async writeSite(
    target: Target,
    hosts: readonly string[],
    port: number,
  ) {
    const site = renderSite({ target, hosts, port });
    const previous = await this.deps.readFile(site.path);
    if (previous === site.content) return { path: site.path, changed: false };
    await this.applySiteChange(site.path, previous, () =>
      this.deps.writeFileAtomic(site.path, site.content),
    );
    return { path: site.path, changed: true };
  }

  private async removeSite(target: Target) {
    const path = `${CADDY_SITES_DIR}/${siteName(target)}.caddy`;
    const previous = await this.deps.readFile(path);
    if (previous === null) return { path, removed: false };
    await this.applySiteChange(path, previous, () =>
      this.deps.removeFile(path),
    );
    return { path, removed: true };
  }

  /** One preview's file, rendered here from validated values (never the caller's text), checked
   * again, written atomically; then the same validate + bounded reload as site.write. */
  private async writePreview(input: PreviewSiteInput) {
    const file = assertPreviewFile(renderPreviewSite(input));
    // Without the wildcard site nothing imports previews/: the file would validate and never serve.
    if ((await this.deps.readFile(CADDY_PREVIEWS_SITE)) === null) {
      throw new AgentError(
        "invalid_config",
        `${CADDY_PREVIEWS_SITE} is not installed (infra/update.sh writes it): no preview can be served`,
      );
    }
    const previous = await this.deps.readFile(file.path);
    if (previous === file.content)
      return { path: file.path, state: input.state, changed: false };
    await this.applySiteChange(file.path, previous, () =>
      this.deps.writeFileAtomic(file.path, file.content),
    );
    return { path: file.path, state: input.state, changed: true };
  }

  /** Which previews have a file, read from the directory's names alone (never their content):
   * only `<project>-pr-<n>.caddy` counts; anything else there is counted, not named, and left. */
  private async listPreviews(): Promise<{
    previews: Array<{ project: string; pr: number }>;
    ignored: number;
  }> {
    const previews: Array<{ project: string; pr: number }> = [];
    let ignored = 0;
    for (const f of (await this.deps.listFiles(CADDY_PREVIEWS_DIR)).sort()) {
      const m = PREVIEW_FILE.exec(`${CADDY_PREVIEWS_DIR}/${f}`);
      if (m?.[2] && m[3]) previews.push({ project: m[2], pr: Number(m[3]) });
      else ignored++;
    }
    return { previews, ignored };
  }

  private async removePreview(project: string, pr: number) {
    const { path } = assertPreviewFile(
      renderPreviewSite({ project, pr, state: "asleep" }),
    );
    const previous = await this.deps.readFile(path);
    if (previous === null) return { path, removed: false };
    await this.applySiteChange(path, previous, () =>
      this.deps.removeFile(path),
    );
    return { path, removed: true };
  }
}
