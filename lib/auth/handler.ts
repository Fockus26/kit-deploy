/**
 * `/api/auth/*`: Better Auth behind a closed list of routes. Better Auth ships many more
 * (sign-up, password reset, account linking, user updates…); here only what passkey + TOTP
 * sign-in and the enrolment need answers, everything else is a 404.
 *
 * Failed sign-ins are logged on one line a fail2ban jail can match (D003):
 *   kit-deploy-auth: failed sign-in from 203.0.113.7 path=/two-factor/verify-totp status=401
 * The line carries the client's address, the route and the status; never a code, token or email.
 */
import { isIP } from "node:net";
import { AUTH_BASE_PATH } from "./config";
import { canEnrol, type SessionSource } from "./session";

type Method = "GET" | "POST";

/** Every route that reaches Better Auth, with its one method. */
export const ROUTES: Readonly<Record<string, readonly Method[]>> = {
  "/get-session": ["GET"],
  "/sign-out": ["POST"],
  "/passkey/generate-authenticate-options": ["GET"],
  "/passkey/verify-authentication": ["POST"],
  "/sign-in/totp": ["POST"],
  "/two-factor/verify-totp": ["POST"],
  "/two-factor/verify-backup-code": ["POST"],
  "/kit/enrol": ["POST"],
  "/passkey/generate-register-options": ["GET"],
  "/passkey/verify-registration": ["POST"],
  "/two-factor/enable": ["POST"],
};

/** Only an enrolment session inside its window adds a factor: a stolen dashboard session
 * cannot plant its own passkey or TOTP. */
export const ENROL_ONLY: ReadonlySet<string> = new Set([
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/two-factor/enable",
]);

/** Routes where a refusal means a wrong credential (or too many tries). */
export const SIGN_IN: ReadonlySet<string> = new Set([
  "/passkey/verify-authentication",
  "/sign-in/totp",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/kit/enrol",
]);

export type AuthHandlerDeps = {
  auth: SessionSource & { handler(request: Request): Promise<Response> };
  log?: (line: string) => void;
  now?: () => number;
};

const json = (status: number, code: string, headers: HeadersInit = {}) =>
  Response.json(
    { code },
    { status, headers: { "cache-control": "no-store", ...headers } },
  );

/** The client's address as Caddy forwarded it; "-" if absent or not one plain IP. */
export function clientIp(request: Request | Headers): string {
  const headers = request instanceof Headers ? request : request.headers;
  const v = headers.get("x-forwarded-for")?.trim() ?? "";
  return isIP(v) ? v : "-";
}

/** The fail2ban line (D003) for a refused code anywhere: the sign-in routes above and the panel's
 * TOTP re-check (lib/panel/actions/passkeys.ts, D055). Never the code itself. */
export function failedLine(ip: string, path: string, status: number): string {
  return `kit-deploy-auth: failed sign-in from ${ip} path=${path} status=${status}`;
}

export async function handleAuth(
  request: Request,
  deps: AuthHandlerDeps,
): Promise<Response> {
  const log = deps.log ?? ((l: string) => console.warn(l));
  const now = deps.now ?? Date.now;
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return json(404, "NOT_FOUND");
  const path = pathname.slice(AUTH_BASE_PATH.length);
  const methods = ROUTES[path];
  if (!methods) return json(404, "NOT_FOUND");
  if (!methods.includes(request.method as Method)) {
    return json(405, "METHOD_NOT_ALLOWED", { allow: methods.join(", ") });
  }

  if (ENROL_ONLY.has(path)) {
    let ok = false;
    try {
      const s = await deps.auth.api.getSession({ headers: request.headers });
      ok = s != null && canEnrol(s, now());
    } catch {
      ok = false;
    }
    if (!ok) return json(403, "ENROLMENT_SESSION_REQUIRED");
  }

  // The passkey plugin accepts `createSession: true` on registration and answers with a new,
  // full session: the enrolment session would leave as a dashboard one. Signing in is a separate
  // step (security review, 2026-11-13).
  if (path === "/passkey/verify-registration") {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      body = null;
    }
    if (
      body !== null &&
      typeof body === "object" &&
      "createSession" in body &&
      (body as { createSession?: unknown }).createSession !== false
    ) {
      return json(400, "CREATE_SESSION_NOT_ALLOWED");
    }
  }

  const response = await deps.auth.handler(request);
  if (SIGN_IN.has(path) && response.status >= 400 && response.status < 500) {
    log(failedLine(clientIp(request), path, response.status));
  }
  return response;
}
