/**
 * "Is this request from a signed-in dashboard session?" for route handlers (U4's
 * /preview-access, the dashboard's API later). A session opened by an enrolment link is not one:
 * it may only register a passkey and TOTP.
 */

export type SessionLike = {
  session: { expiresAt: Date | string; enrolUntil?: Date | string | null };
  user: { id: string; email: string };
};

/** What the helpers need from Better Auth: `auth.api.getSession`. */
export type SessionSource = {
  api: {
    getSession(args: { headers: Headers }): Promise<SessionLike | null>;
  };
};

export type DashboardUser = { userId: string; email: string };

const time = (d: Date | string) => new Date(d).getTime();

export function isEnrolmentSession(s: SessionLike): boolean {
  return s.session.enrolUntil != null;
}

/** An enrolment session still inside its window. */
export function canEnrol(s: SessionLike, now = Date.now()): boolean {
  const until = s.session.enrolUntil;
  return until != null && time(until) > now && time(s.session.expiresAt) > now;
}

export async function dashboardUser(
  auth: SessionSource,
  request: Request | Headers,
  now = Date.now(),
): Promise<DashboardUser | null> {
  const headers = request instanceof Headers ? request : request.headers;
  let s: SessionLike | null;
  try {
    s = await auth.api.getSession({ headers });
  } catch {
    // A broken cookie or the database down: not signed in, never a 500 that leaks why.
    return null;
  }
  if (!s || isEnrolmentSession(s) || time(s.session.expiresAt) <= now)
    return null;
  return { userId: s.user.id, email: s.user.email };
}
