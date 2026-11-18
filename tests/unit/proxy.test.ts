import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "../../lib/auth/cookie";
import { proxy } from "../../proxy";

const req = (path: string, init: { method?: string; cookie?: boolean } = {}) =>
  new NextRequest(`https://deploy.fockus.dev${path}`, {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: `${SESSION_COOKIE}=x` } : {},
  });

/** NextResponse.next() carries this header; a redirect carries Location. */
const passes = (r: Response) => r.headers.get("x-middleware-next") === "1";

describe("proxy: only page loads go to /login", () => {
  test("a page without the cookie → /login with where it was going", () => {
    const r = proxy(req("/p/kd_hello/env"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(
      "https://deploy.fockus.dev/login?next=%2Fp%2Fkd_hello%2Fenv",
    );
  });

  test("HEAD is a page load too", () => {
    expect(proxy(req("/", { method: "HEAD" })).status).toBe(307);
  });

  test("a POST without the cookie (a Server Action) is never redirected", () => {
    for (const path of ["/", "/p/kd_hello/env", "/new", "/settings"]) {
      const r = proxy(req(path, { method: "POST" }));
      expect(passes(r)).toBe(true);
      expect(r.headers.get("location")).toBeNull();
    }
  });

  test("with the cookie, and on the public pages, it passes", () => {
    expect(passes(proxy(req("/p/kd_hello", { cookie: true })))).toBe(true);
    expect(passes(proxy(req("/login")))).toBe(true);
  });
});
