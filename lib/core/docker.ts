import {
  APP_USER,
  CONTAINER_PORT,
  DB_HOST,
  LOG_OPTS,
  MANAGED_LABEL,
  MEMORY_MB,
  PORT_RANGE,
} from "./constants";
import { containerName, siteName, type Target } from "./target";
import { assertAbsolutePath, assertImage, assertIntInRange } from "./validate";

export type RunInput = {
  target: Target;
  /** The commit the image was built from. */
  sha: string;
  /** `ghcr.io/<owner>/<repo>:<sha>` or pinned by digest. */
  image: string;
  /** Loopback port from `allocatePort`. */
  port: number;
  /** Hard memory limit. D017: production 256–512, previews 384. */
  memoryMb: number;
  /** Root-only file with the runtime variables, written by kit-agent (phase 04). */
  envFile?: string;
};

/** ~75 % of the limit for V8's heap, so the process fails with a clear heap error before the
 * kernel OOM-kills the container. */
export function maxOldSpaceMb(memoryMb: number): number {
  return Math.floor(memoryMb * 0.75);
}

/**
 * The argv after `docker`, for `Bun.spawn(["docker", ...dockerRunArgs(x)])` — never joined into
 * a shell string. Every value is validated, and none can start with `-`.
 */
export function dockerRunArgs(input: RunInput): string[] {
  const name = containerName(input.target, input.sha);
  const image = assertImage(input.image);
  const port = assertIntInRange(
    "port",
    input.port,
    PORT_RANGE.min,
    PORT_RANGE.max,
  );
  const mem = assertIntInRange(
    "memoryMb",
    input.memoryMb,
    MEMORY_MB.min,
    MEMORY_MB.max,
  );

  const args = [
    "run",
    "--detach",
    "--name",
    name,
    // Swap equal to memory: the limit is hard, the container does not spill into the host's swap.
    `--memory=${mem}m`,
    `--memory-swap=${mem}m`,
    `--user=${APP_USER}`,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=256",
    // D016: loopback only — Docker's iptables rules would publish 0.0.0.0 past ufw.
    `--publish=127.0.0.1:${port}:${CONTAINER_PORT}`,
    // Same DATABASE_URL as on Vercel; the traffic stays on the machine and verify-full matches.
    `--add-host=${DB_HOST}:host-gateway`,
    "--restart=unless-stopped",
    "--log-driver=json-file",
    `--log-opt=max-size=${LOG_OPTS.maxSize}`,
    `--log-opt=max-file=${LOG_OPTS.maxFile}`,
    `--label=${MANAGED_LABEL}=1`,
    `--label=${MANAGED_LABEL}.site=${siteName(input.target)}`,
    `--label=${MANAGED_LABEL}.project=${input.target.project}`,
    `--label=${MANAGED_LABEL}.env=${input.target.env}`,
    `--label=${MANAGED_LABEL}.sha=${input.sha}`,
    `--label=${MANAGED_LABEL}.port=${port}`,
  ];
  if (input.envFile !== undefined) {
    args.push(`--env-file=${assertAbsolutePath(input.envFile)}`);
  }
  // `--env` wins over `--env-file` in Docker: a project variable cannot override the heap size
  // tied to the limit, nor the port Caddy proxies to.
  args.push(
    `--env=NODE_OPTIONS=--max-old-space-size=${maxOldSpaceMb(mem)}`,
    `--env=PORT=${CONTAINER_PORT}`,
    "--env=HOSTNAME=0.0.0.0",
    image,
  );
  return args;
}
