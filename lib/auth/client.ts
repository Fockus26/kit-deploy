/**
 * Better Auth in the browser: the passkey and two-factor client plugins over U2's closed list of
 * routes (lib/auth/handler.ts). Imported only by client components (app/login, app/enrol).
 * Nothing here logs: the enrolment token, codes and emails never reach the console.
 */
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";

/** Same as AUTH_BASE_PATH in ./config (not imported: that module is server-only). */
const AUTH_BASE_PATH = "/api/auth";

export const authClient = createAuthClient({
  basePath: AUTH_BASE_PATH,
  plugins: [passkeyClient(), twoFactorClient()],
});

/** What every call answers with when it fails (Better Auth's `{ data, error }`). */
export type ClientError = {
  status?: number;
  code?: string;
  message?: string;
} | null;

export type EnrolStart = { email: string; enrolUntil: string };

/** POST /kit/enrol {token}: the one-time link → an enrolment session (lib/auth/plugin.ts). */
export function redeemEnrolment(token: string) {
  return authClient.$fetch<EnrolStart>("/kit/enrol", {
    method: "POST",
    body: { token },
    throw: false,
  });
}

/** POST /sign-in/totp {email}: opens the challenge verify-totp / verify-backup-code then checks. */
export function startCodeSignIn(email: string) {
  return authClient.$fetch<{ twoFactorRedirect: boolean }>("/sign-in/totp", {
    method: "POST",
    body: { email },
    throw: false,
  });
}
