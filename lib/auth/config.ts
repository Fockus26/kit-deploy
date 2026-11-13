/**
 * Better Auth for the dashboard (D003): passkey first, TOTP and recovery codes as backup, no
 * password, no sign-up. Built by a function, never at import time, so `next build` needs no
 * secret; `lib/auth/index.ts` builds the real one from the environment.
 *
 * Every cookie is `__Host-kd.*`: Secure, Path=/ and no Domain, which the browser itself
 * enforces for that prefix. The dashboard session therefore never leaves deploy.fockus.dev and
 * a production site on *.fockus.dev never receives it (D013).
 */
import { passkey } from "@better-auth/passkey";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { COOKIE_PREFIX } from "./cookie";
import type { EnrolmentStore } from "./enrolment";
import { kitAuth } from "./plugin";

export { COOKIE_PREFIX, SESSION_COOKIE } from "./cookie";
export const AUTH_BASE_PATH = "/api/auth";
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;

export type AuthConfig = {
  /** BETTER_AUTH_SECRET: signs cookies and encrypts the TOTP secret and recovery codes. */
  secret: string;
  /** https://deploy.fockus.dev (http://localhost:<port> in development). */
  baseURL: string;
  database: NonNullable<BetterAuthOptions["database"]>;
  enrolments: EnrolmentStore;
  /** Tests turn it off to drive many requests; production always has it. */
  rateLimit?: boolean;
  now?: () => number;
};

/** Requests per window and IP on the routes that take a credential. */
const STRICT = { window: 60, max: 10 };

export function authOptions(c: AuthConfig) {
  if (c.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `the auth secret must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  const url = new URL(c.baseURL);
  return {
    appName: "kit-deploy",
    baseURL: url.origin,
    basePath: AUTH_BASE_PATH,
    secret: c.secret,
    database: c.database,
    trustedOrigins: [url.origin],
    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: 60 * 60,
    },
    rateLimit: {
      enabled: c.rateLimit ?? true,
      // One web container: memory is enough, and fail2ban (D003) covers restarts.
      storage: "memory",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/*": STRICT,
        "/two-factor/*": STRICT,
        "/passkey/verify-authentication": STRICT,
        "/kit/enrol": { window: 60, max: 5 },
      },
    },
    advanced: {
      // Better Auth's `__Secure-` prefix is replaced by the stricter `__Host-` in cookiePrefix.
      useSecureCookies: false,
      cookiePrefix: COOKIE_PREFIX,
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: {
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
      // Caddy is the only way in and sets X-Forwarded-For to the client's address (it ignores
      // the client's own header): one value, the real IP.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    plugins: [
      passkey({
        rpID: url.hostname,
        rpName: "kit-deploy",
        origin: url.origin,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      }),
      twoFactor({
        issuer: "kit-deploy",
        // There is no password to ask for: enabling TOTP needs the enrolment session instead
        // (lib/auth/handler.ts).
        allowPasswordless: true,
        backupCodeOptions: { amount: 10, length: 12 },
      }),
      kitAuth({ enrolments: c.enrolments, now: c.now }),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(c: AuthConfig) {
  return betterAuth(authOptions(c));
}

export type Auth = ReturnType<typeof createAuth>;
