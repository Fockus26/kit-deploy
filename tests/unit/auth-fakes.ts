/**
 * The real Better Auth config (lib/auth/config.ts) over Better Auth's memory adapter: the tests
 * drive actual HTTP requests through `handleAuth` and read the real Set-Cookie headers.
 */
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth } from "../../lib/auth/config";
import type { EnrolmentStore } from "../../lib/auth/enrolment";
import { handleAuth } from "../../lib/auth/handler";

export const ORIGIN = "https://deploy.fockus.dev";
/** Test-only, never a real secret. */
const TEST_SECRET = "test-only-secret-0123456789abcdef-not-real";

type Link = { userId: string; hash: string; expiresAt: Date; usedAt?: Date };

export function memoryEnrolments() {
  const links: Link[] = [];
  const store: EnrolmentStore = {
    async redeem(hash, now) {
      const l = links.find(
        (x) => x.hash === hash && !x.usedAt && x.expiresAt > now,
      );
      if (!l) return null;
      l.usedAt = now;
      return l.userId;
    },
  };
  return { store, links };
}

export function testAuth(
  opts: { rateLimit?: boolean; now?: () => number } = {},
) {
  const db: Record<string, Record<string, unknown>[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    passkey: [],
    twoFactor: [],
  };
  const enrolments = memoryEnrolments();
  const auth = createAuth({
    secret: TEST_SECRET,
    baseURL: ORIGIN,
    database: memoryAdapter(db),
    enrolments: enrolments.store,
    rateLimit: opts.rateLimit ?? false,
    now: opts.now,
  });
  const logs: string[] = [];

  /** A cookie jar per "browser": keeps what Set-Cookie gave and sends it back. */
  function browser(ip = "203.0.113.7") {
    const jar = new Map<string, string>();
    const setCookies: string[] = [];
    async function request(
      method: "GET" | "POST",
      path: string,
      body?: unknown,
    ): Promise<Response> {
      const headers = new Headers({
        origin: ORIGIN,
        "x-forwarded-for": ip,
        "user-agent": "bun-test",
      });
      if (body !== undefined) headers.set("content-type", "application/json");
      if (jar.size)
        headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
      const res = await handleAuth(
        new Request(`${ORIGIN}/api/auth${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { auth, log: (l) => logs.push(l), now: opts.now },
      );
      for (const c of res.headers.getSetCookie()) {
        setCookies.push(c);
        const [pair = ""] = c.split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        if (!value || /max-age=0/i.test(c)) jar.delete(name);
        else jar.set(name, value);
      }
      return res;
    }
    const cookieHeader = () =>
      new Headers({
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      });
    return { request, jar, setCookies, cookieHeader };
  }

  /** As `kit-deploy user create` does: a row straight in the table, not through Better Auth. */
  async function seedUser(email = "cesar@example.com") {
    const user = {
      id: crypto.randomUUID(),
      email,
      name: email,
      emailVerified: true,
      twoFactorEnabled: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    db.user?.push(user);
    return user;
  }

  return { auth, db, enrolments, logs, browser, seedUser };
}
