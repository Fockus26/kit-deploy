/**
 * A fresh TOTP code as the second check of a dangerous panel action (D055): a stolen dashboard
 * cookie alone is not enough to remove a passkey.
 *
 * The code is checked by Better Auth's own verify-totp, called server-side with the request's
 * session (`auth.api.verifyTOTP`): no new public route goes through lib/auth/handler.ts. Called
 * that way Better Auth neither rate-limits it (its limiter only sees HTTP requests) nor counts
 * it toward its account lockout (that is for sign-in challenges only), nor remembers a used code
 * — so `memoryTotpGuard` does those three here.
 */

export type TotpVerdict = "ok" | "invalid" | "not_enabled";

/** Checks `code` against the TOTP of the session's user, who must be `userId`. */
export type TotpVerifier = (
  userId: string,
  code: string,
) => Promise<TotpVerdict>;

/** What it needs from Better Auth: `auth.api.verifyTOTP`. */
export type VerifyTotpSource = {
  api: {
    verifyTOTP(args: {
      body: { code: string };
      headers: Headers;
    }): Promise<{ user: { id: string } }>;
  };
};

/** A Better Auth APIError's HTTP status, without `instanceof` (two copies of the class exist). */
function statusOf(e: unknown): number | null {
  if (typeof e !== "object" || e === null) return null;
  const s = (e as { statusCode?: unknown }).statusCode;
  return typeof s === "number" ? s : null;
}

export function betterAuthTotp(
  auth: () => VerifyTotpSource,
  headers: () => Promise<Headers>,
): TotpVerifier {
  return async (userId, code) => {
    let verifiedId: string;
    try {
      const res = await auth().api.verifyTOTP({
        body: { code },
        headers: await headers(),
      });
      verifiedId = res.user.id;
    } catch (e) {
      const status = statusOf(e);
      // 401 INVALID_CODE (or no session any more); 400 TOTP_NOT_ENABLED.
      if (status === 401) return "invalid";
      if (status === 400) return "not_enabled";
      throw e;
    }
    // The same cookie answered both checks; a mismatch would be a bug, never a pass.
    return verifiedId === userId ? "ok" : "invalid";
  };
}

/**
 * `attempt` is synchronous and runs before the (async) check: it counts the try as a failure and
 * claims the code up front, so a burst of parallel requests cannot all slip past the limit or
 * spend the same code twice. `succeeded` then clears the count; `failed` only frees the code.
 */
export type TotpGuard = {
  /** "blocked": too many wrong codes lately; "reused": this code already confirmed something
   * (or is being checked right now). */
  attempt(userId: string, code: string): "go" | "blocked" | "reused";
  /** The code was wrong (or the check broke): the code is free again, the failure stays. */
  failed(userId: string, code: string): void;
  /** The code was right: consecutive failures start over; the code stays spent. */
  succeeded(userId: string): void;
};

export const TOTP_GUARD = {
  /** Wrong codes per user within `windowMs` before it refuses (Better Auth's sign-in: 5 per
   * challenge, 10 per account). */
  maxFailures: 5,
  windowMs: 15 * 60_000,
  /** A 30 s code is accepted one step either side (~90 s): kept spent a little longer. */
  reuseMs: 2 * 60_000,
} as const;

/**
 * In memory: one web container (like Better Auth's own limiter, lib/auth/config.ts). A restart
 * forgets it; the fail2ban jail on the `kit-deploy-auth: failed` lines does not (D003).
 */
export function memoryTotpGuard(
  opts: { now?: () => number } & Partial<typeof TOTP_GUARD> = {},
): TotpGuard {
  const now = opts.now ?? Date.now;
  const max = opts.maxFailures ?? TOTP_GUARD.maxFailures;
  const windowMs = opts.windowMs ?? TOTP_GUARD.windowMs;
  const reuseMs = opts.reuseMs ?? TOTP_GUARD.reuseMs;
  const failures = new Map<string, number[]>();
  const spent = new Map<string, number>();
  const key = (userId: string, code: string) => `${userId}\n${code}`;

  const recent = (userId: string, t: number) =>
    (failures.get(userId) ?? []).filter((at) => at > t - windowMs);

  return {
    attempt(userId, code) {
      const t = now();
      for (const [k, until] of spent) if (until <= t) spent.delete(k);
      const tries = recent(userId, t);
      if (tries.length >= max) return "blocked";
      if (spent.has(key(userId, code))) return "reused";
      failures.set(userId, [...tries, t]);
      spent.set(key(userId, code), t + reuseMs);
      return "go";
    },
    failed(userId, code) {
      spent.delete(key(userId, code));
    },
    succeeded(userId) {
      failures.delete(userId);
    },
  };
}
