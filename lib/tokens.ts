/**
 * Per-repo deploy tokens (`KIT_DEPLOY_TOKEN` in the project's GitHub secrets). 32 random bytes,
 * so a plain sha256 is enough to store them: there is nothing to brute-force.
 */
import { createHash, randomBytes } from "node:crypto";

const PREFIX = "kdt_";
/** kdt_ + 43 base64url chars (32 bytes). */
const TOKEN = /^kdt_[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new token and the hash to store. The token is shown once, to César, and never logged. */
export function generateDeployToken(): { token: string; hash: string } {
  const token = PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** The token from `Authorization: Bearer kdt_…`, or null if the header is missing or malformed. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer (\S+)$/.exec(header ?? "");
  const token = m?.[1];
  return token && TOKEN.test(token) ? token : null;
}
