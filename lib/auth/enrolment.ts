/**
 * One-time enrolment links (D003: no sign-up; the first account is seeded by CLI).
 * `kit-deploy user create|enrol` prints `https://deploy.fockus.dev/enrol#kde_…` in César's
 * terminal; the page posts the token to `/api/auth/kit/enrol`, which opens a short enrolment
 * session that may only register a passkey and TOTP.
 *
 * The token rides in the URL fragment: browsers never send it, so it never reaches Caddy's
 * access log. Only its sha256 is stored, as with deploy tokens (32 random bytes).
 */
import { randomBytes } from "node:crypto";
import { hashToken } from "../tokens";

const PREFIX = "kde_";
export const ENROL_TOKEN = /^kde_[A-Za-z0-9_-]{43}$/;
/** How long a printed link stays valid. */
export const ENROL_LINK_TTL_MS = 15 * 60 * 1000;
/** How long the session it opens may register factors. */
export const ENROL_SESSION_TTL_MS = 30 * 60 * 1000;

export function generateEnrolmentToken(): { token: string; hash: string } {
  const token = PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function enrolmentLink(dashboardHost: string, token: string): string {
  return `https://${dashboardHost}/enrol#${token}`;
}

export interface EnrolmentStore {
  /** Marks an unused, unexpired link as used and returns its user, atomically; null otherwise.
   * A second redeem of the same link gets null. */
  redeem(tokenHash: string, now: Date): Promise<string | null>;
}
