/**
 * The dashboard's Better Auth, from the environment (`/etc/kit-deploy/web.env` on the VPS):
 *
 *   BETTER_AUTH_SECRET  generated on the VPS by infra/update.sh; never printed
 *   BETTER_AUTH_URL     https://deploy.fockus.dev (infra/update.sh passes it)
 *   DATABASE_URL        kit_deploy through PgBouncer (D019)
 *
 * Opened on first use, never at build time.
 */
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  authAccount,
  authPasskey,
  authSession,
  authTwoFactor,
  authUser,
  authVerification,
} from "../db/schema";
import { db } from "../db/store";
import { type Auth, createAuth } from "./config";
import { dashboardUser } from "./session";
import { drizzleEnrolmentStore } from "./store";

/** The Drizzle tables under Better Auth's model names. */
export const AUTH_SCHEMA = {
  user: authUser,
  session: authSession,
  account: authAccount,
  verification: authVerification,
  passkey: authPasskey,
  twoFactor: authTwoFactor,
};

let shared: Auth | null = null;

export function auth(): Auth {
  if (!shared) {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
    const database = db();
    shared = createAuth({
      secret,
      baseURL: process.env.BETTER_AUTH_URL ?? "https://deploy.fockus.dev",
      database: drizzleAdapter(database, {
        provider: "pg",
        schema: AUTH_SCHEMA,
      }),
      enrolments: drizzleEnrolmentStore(database),
    });
  }
  return shared;
}

/** The signed-in dashboard user of a route handler's request, or null. */
export function requestUser(request: Request | Headers) {
  return dashboardUser(auth(), request);
}
