/**
 * Environment variables encrypted at rest (D012, brief "Secrets encrypted at rest"): AES-256-GCM
 * with a key derived from `/etc/kit-deploy/master.key`. Only kit-agent (root) ever holds that key
 * (D011); the web app and the CLI store and move the sealed blobs without being able to open them.
 *
 * Each blob is bound by its additional data (AAD) to the row it belongs to — project, environment,
 * name, secret flag and key version — so copying a ciphertext onto another variable, another
 * environment, or flipping `secret` to false in the database makes it fail to open instead of
 * revealing it.
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import {
  assertEnvironment,
  assertEnvValue,
  ENV_NAME_RE,
  type Environment,
} from "./env";
import { assertProject, CoreInputError } from "./validate";

/** The version of the key derivation below; stored per row for a later rotation. */
export const KEY_VERSION = 1;
const HKDF_INFO = "kit-deploy env v1";
const MASTER_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Opaque to everyone but the agent: what `env_vars` stores (base64 columns). */
export type Sealed = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
};

/** Which row a blob belongs to. Every field goes into the AAD. */
export type EnvSlot = {
  project: string;
  environment: Environment;
  name: string;
  secret: boolean;
};

/** Every failure to open has the same message: no oracle on which part was wrong. */
export class EnvCryptoError extends Error {
  constructor(message = "variable cannot be decrypted") {
    super(message);
    this.name = "EnvCryptoError";
  }
}

function masterBytes(masterKeyFile: string): Buffer {
  const raw = Buffer.from(masterKeyFile.trim(), "base64");
  if (raw.length !== MASTER_KEY_BYTES) {
    // Never echo the file: it is the key.
    throw new EnvCryptoError(
      `master key must be base64 of ${MASTER_KEY_BYTES} bytes`,
    );
  }
  return raw;
}

/** The AES key for variables, from master.key's text (base64 of 32 random bytes, server-ready.sh). */
export function deriveEnvKey(masterKeyFile: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      masterBytes(masterKeyFile),
      Buffer.alloc(0),
      HKDF_INFO,
      MASTER_KEY_BYTES,
    ),
  );
}

/**
 * A project's `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for one environment (base64 of 32 bytes): the
 * same on every build, so a page from the previous deployment can still call the new one's Server
 * Actions during a switch (Next.js self-hosting guide). Derived, never stored; another HKDF
 * `info` than the variables' key, so knowing it says nothing about that one. Production's and
 * the previews' differ, so a preview build gets its own. (Not a wall against a PR's code: a repo
 * has one deploy token, which can already deploy production; separate tokens would be one.)
 */
export function deriveServerActionsKey(
  masterKeyFile: string,
  project: string,
  environment: "production" | "preview",
): string {
  assertProject(project);
  assertEnvironment(environment);
  return Buffer.from(
    hkdfSync(
      "sha256",
      masterBytes(masterKeyFile),
      Buffer.alloc(0),
      `kit-deploy server-actions v1\0${project}\0${environment}`,
      MASTER_KEY_BYTES,
    ),
  ).toString("base64");
}

function checkSlot(slot: EnvSlot): EnvSlot {
  assertProject(slot.project);
  assertEnvironment(slot.environment);
  // Only the format: a managed name (DATABASE_URL) is sealed by the agent itself.
  if (!ENV_NAME_RE.test(slot.name)) {
    throw new CoreInputError(`invalid variable name "${slot.name}"`);
  }
  if (typeof slot.secret !== "boolean") {
    throw new CoreInputError("secret must be a boolean");
  }
  return slot;
}

/** NUL-separated: none of the fields can contain a NUL (validated), so the encoding is unambiguous. */
export function envAad(slot: EnvSlot, keyVersion: number): Buffer {
  const s = checkSlot(slot);
  return Buffer.from(
    [
      "kit-deploy/env",
      String(keyVersion),
      s.project,
      s.environment,
      s.name,
      s.secret ? "secret" : "plain",
    ].join("\0"),
    "utf8",
  );
}

export function seal(key: Buffer, slot: EnvSlot, value: string): Sealed {
  assertEnvValue(value);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(envAad(slot, KEY_VERSION));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

function decode(b64: string, bytes?: number): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new EnvCryptoError();
  const buf = Buffer.from(b64, "base64");
  if (bytes !== undefined && buf.length !== bytes) throw new EnvCryptoError();
  return buf;
}

export function open(key: Buffer, slot: EnvSlot, sealed: Sealed): string {
  if (sealed.keyVersion !== KEY_VERSION) throw new EnvCryptoError();
  const aad = envAad(slot, sealed.keyVersion);
  const iv = decode(sealed.iv, IV_BYTES);
  const tag = decode(sealed.tag, TAG_BYTES);
  const ciphertext = decode(sealed.ciphertext);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new EnvCryptoError();
  }
}
