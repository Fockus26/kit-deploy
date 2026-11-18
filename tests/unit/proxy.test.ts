import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "../../lib/auth/cookie";
import { handleProxy, type ProxyDeps, proxy } from "../../proxy";

const req = (path: string, init: { method?: string; cookie?: boolean } = {}) =>
  new NextRequest(`https://deploy.fockus.dev${path}`, {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: `${SESSION_COOKIE}=x` } : {},
  });

/** NextResponse.next() carries this header; a redirect carries Location. */
const passes = (r: Response) => r.headers.get("x-middleware-next") === "1";

describe("proxy: only page loads go to /login", () => {
  test("a page without the cookie → /login with where it was going", async () => {
    const r = await proxy(req("/p/kd_hello/env"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(
      "https://deploy.fockus.dev/login?next=%2Fp%2Fkd_hello%2Fenv",
    );
  });

  test("HEAD is a page load too", async () => {
    expect((await proxy(req("/", { method: "HEAD" }))).status).toBe(307);
  });

  test("a POST without the cookie (a Server Action) is never redirected", async () => {
    for (const path of ["/", "/p/kd_hello/env", "/new", "/settings"]) {
      const r = await proxy(req(path, { method: "POST" }));
      expect(passes(r)).toBe(true);
      expect(r.headers.get("location")).toBeNull();
    }
  });

  test("with the cookie, and on the public pages, it passes", async () => {
    expect(passes(await proxy(req("/", { cookie: true })))).toBe(true);
    expect(passes(await proxy(req("/login")))).toBe(true);
  });
});

describe("proxy: /p/<project> checks a real session before the project", () => {
  const deps = (valid: boolean | "throws", exists: boolean) => {
    const calls = { lookups: 0 };
    const d: ProxyDeps = {
      validSession: async () => {
        if (valid === "throws") throw new Error("db down");
        return valid;
      },
      missing: async () => {
        calls.lookups++;
        return !exists;
      },
    };
    return { d, calls };
  };
  const run = (path: string, valid: boolean | "throws", exists: boolean) => {
    const { d, calls } = deps(valid, exists);
    return handleProxy(req(path, { cookie: true }), d).then((r) => ({
      r,
      calls,
    }));
  };

  test("a fake cookie: existing and missing redirect to /login identically, no lookup", async () => {
    const a = await run("/p/maranatha", false, true);
    const b = await run("/p/nope", false, false);
    for (const x of [a, b]) {
      expect(x.r.status).toBe(307);
      expect(x.calls.lookups).toBe(0);
    }
    expect(a.r.headers.get("location")).toBe(
      "https://deploy.fockus.dev/login?next=%2Fp%2Fmaranatha",
    );
    expect(b.r.headers.get("location")).toBe(
      "https://deploy.fockus.dev/login?next=%2Fp%2Fnope",
    );
  });

  test("a session check that throws → /login", async () => {
    const x = await run("/p/maranatha", "throws", true);
    expect(x.r.status).toBe(307);
    expect(x.calls.lookups).toBe(0);
  });

  test("valid session: missing → 404, existing → passes", async () => {
    expect((await run("/p/nope", true, false)).r.status).toBe(404);
    expect(passes((await run("/p/maranatha", true, true)).r)).toBe(true);
  });

  test("other paths with a cookie never check the session or the database", async () => {
    const x = await run("/settings", false, false);
    expect(passes(x.r)).toBe(true);
    expect(x.calls.lookups).toBe(0);
  });
});
