/**
 * The closed list of operations. Each one takes an already-validated request and does its
 * work only through `Deps`. Containers are only stopped or removed when Docker itself says they
 * carry kit-deploy's label — never gaby, evolution_* or anything else on the VPS.
 */
import {
  allocatePort,
  CADDY_SITES_DIR,
  containerName,
  dockerRunArgs,
  MANAGED_LABEL,
  renderSite,
  siteName,
  type Target,
} from "../lib/core";
import { assertImage } from "../lib/core/validate";
import type { Deps, RunResult } from "./deps";
import { AGENT_VERSION, type ErrorCode, type Request } from "./protocol";

export const CADDYFILE = "/etc/caddy/Caddyfile";
const PULL_TIMEOUT_MS = 600_000;
const HEALTH_TIMEOUT_MS = 3_000;
/** A port handed out by `ports.allocate` stays reserved this long, so two deploys that allocate
 * before either has started its container do not get the same one. */
export const RESERVATION_MS = 10 * 60_000;

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
    }
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
    const argv = ["docker", ...dockerRunArgs(params)];
    const r = await must(this.deps, argv, "docker run");
    this.reserved.delete(params.port);
    return {
      name: containerName(params.target, params.sha),
      id: r.stdout.trim(),
    };
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
    const v = await this.deps.run([
      "caddy",
      "validate",
      `--config=${CADDYFILE}`,
      "--adapter=caddyfile",
    ]);
    if (v.code !== 0) {
      await restore();
      throw new AgentError(
        "invalid_config",
        `caddy validate failed: ${tail(v.stderr)}`,
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
}
