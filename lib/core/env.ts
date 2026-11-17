/**
 * The rules of a project's environment variables (brief F4), shared by the schema, the agent, the
 * CLI and the API. A value ends up in a Docker `--env-file` written by kit-agent (root), so what a
 * line of that file cannot carry is refused here, before it is ever encrypted.
 */
import { CoreInputError } from "./validate";

/** Vercel's three sets. Development is never deployed: it is what `env pull` writes. */
export const ENVIRONMENTS = ["production", "preview", "development"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** POSIX-style name, upper case like every Next.js project's `.env`. */
export const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]{0,127}$/;
/** Inlined into the client bundle at build (Next.js docs): public by nature. */
export const PUBLIC_PREFIX = "NEXT_PUBLIC_";

/** Set by the platform on every container; `--env` wins over the env file anyway (docker.ts). */
export const RESERVED_NAMES = ["PORT", "HOSTNAME", "NODE_OPTIONS"] as const;
/** Put in by kit-deploy itself (phase 04 U5): nobody sets them by hand. */
export const MANAGED_NAMES = [
  "DATABASE_URL",
  "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
] as const;

/** Bytes of one value. Generous for a key or a JSON blob, small enough for a Docker env file. */
export const MAX_VALUE_BYTES = 32 * 1024;

const NOT_SETTABLE: ReadonlySet<string> = new Set([
  ...RESERVED_NAMES,
  ...MANAGED_NAMES,
]);

export function assertEnvironment(env: string): Environment {
  if (!(ENVIRONMENTS as readonly string[]).includes(env)) {
    throw new CoreInputError(
      `invalid environment "${env}": expected ${ENVIRONMENTS.join(", ")}`,
    );
  }
  return env as Environment;
}

/**
 * Names that steer the runtime rather than the app (phase 04 security review, F1): a proxy for
 * every outbound call, TLS checks off, a preloaded library, another CA, Node's or Bun's own
 * switches, the PATH that finds `node`. Set on a pinned container, any of them would let whoever
 * writes a row read the container's secrets on the wire. Refused at seal, in the database and
 * again by kit-agent at each start. The same list is `env_vars_name_not_runtime` (migration 0008).
 */
export const RUNTIME_NAME_RE =
  /^(?:PATH|NODE_[A-Z0-9_]*|LD_[A-Z0-9_]*|[A-Z0-9_]*_PROXY|SSL_CERT_[A-Z0-9_]*|OPENSSL_[A-Z0-9_]*|UV_[A-Z0-9_]*|BUN_[A-Z0-9_]*)$/;

/** A name a person may set: well-formed, not reserved, not managed, not the runtime's. */
export function assertEnvName(name: string): string {
  if (!ENV_NAME_RE.test(name)) {
    throw new CoreInputError(
      `invalid variable name "${name}": expected ^[A-Z_][A-Z0-9_]*$, at most 128 chars`,
    );
  }
  if (NOT_SETTABLE.has(name)) {
    throw new CoreInputError(
      `${name} is set by kit-deploy itself and cannot be changed by hand`,
    );
  }
  if (RUNTIME_NAME_RE.test(name)) {
    throw new CoreInputError(
      `${name} configures the runtime (Node, TLS, proxies, the loader), not the app: not settable`,
    );
  }
  return name;
}

export function isPublicName(name: string): boolean {
  return name.startsWith(PUBLIC_PREFIX);
}

/** A `NEXT_PUBLIC_*` ships in the browser's JavaScript: calling it secret would be a lie. */
export function assertSecretFlag(name: string, secret: boolean): boolean {
  if (secret && isPublicName(name)) {
    throw new CoreInputError(
      `${name} cannot be secret: NEXT_PUBLIC_* values are inlined into the browser bundle`,
    );
  }
  return secret;
}

/**
 * One line of a Docker env file: no newline (Docker reads the file line by line, there is no
 * quoting), no NUL, not empty, at most MAX_VALUE_BYTES. The message never echoes the value.
 */
export function assertEnvValue(value: string): string {
  if (value.length === 0) {
    throw new CoreInputError("empty value: to remove a variable use env rm");
  }
  if (/[\r\n\0]/.test(value)) {
    throw new CoreInputError(
      "the value has a newline or a NUL byte: a Docker env file carries one line per variable",
    );
  }
  if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
    throw new CoreInputError(
      `the value is longer than ${MAX_VALUE_BYTES} bytes`,
    );
  }
  return value;
}

/**
 * One `.env` line Next.js reads back exactly (@next/env: dotenv + dotenv-expand), for `env pull`'s
 * `.env.local` and the build's `.env.production.local`. Single quotes keep `#`, spaces, `"` and
 * backslashes; `\$` stops the expansion of `$NAME`. Checked against the real parser in
 * tests/unit/cli-env-pull.test.ts.
 */
export function dotenvLine(name: string, value: string): string {
  return `${name}='${value.replaceAll("$", "\\$")}'\n`;
}
