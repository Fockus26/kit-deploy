import { describe, expect, test } from "bun:test";
import {
  GRANT_TTL_MS,
  handlePreviewAccess,
  handlePreviewAuth,
  handlePreviewExchange,
  PREVIEW_SESSION_TTL_S,
  type PreviewAccessStore,
  parsePreviewTarget,
} from "../../lib/preview/access";

const HOST = "kd-hello-pr-7.preview.fockus.dev";
const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

function memoryStore() {
  const grants: {
    userId: string;
    tokenHash: string;
    host: string;
    path: string;
    expiresAt: Date;
    usedAt: Date | null;
  }[] = [];
  const sessions: { userId: string; tokenHash: string; expiresAt: Date }[] = [];
  const users = new Set(["u1"]);
  const store: PreviewAccessStore = {
    async createGrant(g) {
      grants.push({ ...g, usedAt: null });
    },
    async redeemGrant(hash, host, now) {
      const g = grants.find(
        (x) =>
          x.tokenHash === hash &&
          x.host === host &&
          x.usedAt === null &&
          x.expiresAt > now,
      );
      if (!g) return null;
      g.usedAt = now;
      return { userId: g.userId, path: g.path };
    },
    async createSession(s) {
      sessions.push(s);
    },
    async findSession(hash, now) {
      const s = sessions.find((x) => x.tokenHash === hash && x.expiresAt > now);
      return s && users.has(s.userId)
        ? { userId: s.userId, expiresAt: s.expiresAt }
        : null;
    },
  };
  return { store, grants, sessions, users };
}

const signedIn = async () => ({ userId: "u1" });
const anonymous = async () => null;

function accessReq(to: string) {
  return new Request(
    `https://deploy.fockus.dev/preview-access?to=${encodeURIComponent(to)}`,
  );
}

function exchangeReq(t: string, host = HOST) {
  return new Request("http://127.0.0.1:3100/api/v1/preview-exchange", {
    method: "POST",
    headers: {
      host,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ t }).toString(),
  });
}

function authReq(cookie: string | null, host = HOST, uri = "/x?y=1") {
  const headers: Record<string, string> = {
    "x-forwarded-host": host,
    "x-forwarded-uri": uri,
    "x-forwarded-method": "GET",
  };
  if (cookie) headers.cookie = cookie;
  return new Request("http://127.0.0.1:3100/api/v1/preview-auth", { headers });
}

const tokenIn = async (r: Response) =>
  /name="t" value="(kdg_[A-Za-z0-9_-]{43})"/.exec(await r.text())?.[1] ?? "";

const cookieOf = (r: Response) =>
  /^kd_preview=(kdp_[A-Za-z0-9_-]{43});/.exec(
    r.headers.get("set-cookie") ?? "",
  )?.[1] ?? "";

describe("parsePreviewTarget", () => {
  test("one label under the preview domain, https, default port", () => {
    expect(parsePreviewTarget(`https://${HOST}/a/b?c=1#frag`)).toEqual({
      host: HOST,
      path: "/a/b?c=1",
    });
    expect(parsePreviewTarget(`https://${HOST}`)).toEqual({
      host: HOST,
      path: "/",
    });
  });

  test.each([
    [null],
    [""],
    [`http://${HOST}/`],
    [`https://${HOST}:8443/`],
    [`https://user:pw@${HOST}/`],
    ["https://preview.fockus.dev/"],
    ["https://a.b.preview.fockus.dev/"],
    ["https://evil.example/?x=.preview.fockus.dev"],
    ["https://kd-hello.preview.fockus.dev.evil.example/"],
    ["https://deploy.fockus.dev/"],
    ["https://-bad.preview.fockus.dev/"],
    ["javascript:alert(1)//kd.preview.fockus.dev"],
    [`https://${HOST}/${"a".repeat(2100)}`],
  ])("refuses %p", (raw) => {
    expect(parsePreviewTarget(raw)).toBeNull();
  });
});

describe("the three steps", () => {
  test("signed in: grant → exchange → cookie → forward_auth 204", async () => {
    const m = memoryStore();
    const access = await handlePreviewAccess(
      accessReq(`https://${HOST}/pricing?plan=pro`),
      { store: m.store, user: signedIn, now: () => T0 },
    );
    expect(access.status).toBe(200);
    expect(access.headers.get("cache-control")).toBe("no-store");
    const csp = access.headers.get("content-security-policy") ?? "";
    expect(csp).toContain(`form-action https://${HOST};`);
    expect(csp).not.toContain("unsafe-inline");
    const t = await tokenIn(access.clone());
    expect(t).not.toBe("");
    expect(await access.text()).toContain(
      `action="https://${HOST}/__kit-deploy/exchange"`,
    );
    // Only the hash is stored, bound to the host, for a minute.
    expect(JSON.stringify(m.grants)).not.toContain(t);
    expect(m.grants[0]?.host).toBe(HOST);
    expect(m.grants[0]?.expiresAt.getTime()).toBe(T0 + GRANT_TTL_MS);

    const ex = await handlePreviewExchange(exchangeReq(t), {
      store: m.store,
      now: () => T0 + 5000,
    });
    expect(ex.status).toBe(303);
    expect(ex.headers.get("location")).toBe(`https://${HOST}/pricing?plan=pro`);
    const setCookie = ex.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Domain=preview.fockus.dev");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain(`Max-Age=${PREVIEW_SESSION_TTL_S}`);
    const cookie = cookieOf(ex);
    expect(cookie).not.toBe("");
    expect(JSON.stringify(m.sessions)).not.toContain(cookie);

    const ok = await handlePreviewAuth(authReq(`a=1; kd_preview=${cookie}`), {
      store: m.store,
      now: () => T0 + 10_000,
    });
    expect(ok.status).toBe(204);
  });

  test("no dashboard session → /login, and back to /preview-access after", async () => {
    const m = memoryStore();
    const r = await handlePreviewAccess(accessReq(`https://${HOST}/x`), {
      store: m.store,
      user: anonymous,
    });
    expect(r.status).toBe(303);
    const loc = r.headers.get("location") ?? "";
    expect(loc.startsWith("/login?next=")).toBe(true);
    const next = new URL(loc, "https://deploy.fockus.dev").searchParams.get(
      "next",
    );
    expect(next).toBe(
      `/preview-access?to=${encodeURIComponent(`https://${HOST}/x`)}`,
    );
    expect(m.grants).toHaveLength(0);
  });

  test("a bad `to` is a 400 page, never a redirect or a grant", async () => {
    const m = memoryStore();
    const r = await handlePreviewAccess(accessReq("https://evil.example/"), {
      store: m.store,
      user: signedIn,
    });
    expect(r.status).toBe(400);
    expect(r.headers.get("location")).toBeNull();
    expect(m.grants).toHaveLength(0);
  });
});

describe("exchange refuses", () => {
  async function granted() {
    const m = memoryStore();
    const r = await handlePreviewAccess(accessReq(`https://${HOST}/`), {
      store: m.store,
      user: signedIn,
      now: () => T0,
    });
    return { m, t: await tokenIn(r) };
  }

  test("a second use", async () => {
    const { m, t } = await granted();
    const deps = { store: m.store, now: () => T0 + 1000 };
    expect((await handlePreviewExchange(exchangeReq(t), deps)).status).toBe(
      303,
    );
    const again = await handlePreviewExchange(exchangeReq(t), deps);
    expect(again.status).toBe(400);
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  test("another preview's host", async () => {
    const { m, t } = await granted();
    const r = await handlePreviewExchange(
      exchangeReq(t, "other-pr-1.preview.fockus.dev"),
      { store: m.store, now: () => T0 + 1000 },
    );
    expect(r.status).toBe(400);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  test("after a minute", async () => {
    const { m, t } = await granted();
    const r = await handlePreviewExchange(exchangeReq(t), {
      store: m.store,
      now: () => T0 + GRANT_TTL_MS + 1,
    });
    expect(r.status).toBe(400);
  });

  test("a non-preview host, GET, or a malformed token", async () => {
    const { m, t } = await granted();
    const deps = { store: m.store, now: () => T0 + 1000 };
    expect(
      (await handlePreviewExchange(exchangeReq(t, "deploy.fockus.dev"), deps))
        .status,
    ).toBe(404);
    const get = new Request("http://127.0.0.1:3100/api/v1/preview-exchange", {
      headers: { host: HOST },
    });
    expect((await handlePreviewExchange(get, deps)).status).toBe(405);
    expect(
      (await handlePreviewExchange(exchangeReq("kdg_short"), deps)).status,
    ).toBe(400);
    // The real token still works: refusals did not spend it.
    expect((await handlePreviewExchange(exchangeReq(t), deps)).status).toBe(
      303,
    );
  });
});

describe("forward_auth", () => {
  async function withSession() {
    const m = memoryStore();
    const r = await handlePreviewAccess(accessReq(`https://${HOST}/`), {
      store: m.store,
      user: signedIn,
      now: () => T0,
    });
    const ex = await handlePreviewExchange(exchangeReq(await tokenIn(r)), {
      store: m.store,
      now: () => T0,
    });
    return { m, cookie: cookieOf(ex) };
  }

  test("without a cookie → 302 to /preview-access with the wanted URL", async () => {
    const m = memoryStore();
    const r = await handlePreviewAuth(authReq(null, HOST, "/docs?q=1"), {
      store: m.store,
    });
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get("location") ?? "");
    expect(loc.origin).toBe("https://deploy.fockus.dev");
    expect(loc.pathname).toBe("/preview-access");
    expect(loc.searchParams.get("to")).toBe(`https://${HOST}/docs?q=1`);
  });

  test("a forged, expired or orphaned cookie → 302", async () => {
    const { m, cookie } = await withSession();
    const forged = `kdp_${"A".repeat(43)}`;
    for (const [c, now] of [
      [forged, T0],
      [cookie, T0 + PREVIEW_SESSION_TTL_S * 1000 + 1],
      ["garbage", T0],
    ] as const) {
      const r = await handlePreviewAuth(authReq(`kd_preview=${c}`), {
        store: m.store,
        now: () => now,
      });
      expect(r.status).toBe(302);
    }
    m.users.clear(); // the account is gone
    const r = await handlePreviewAuth(authReq(`kd_preview=${cookie}`), {
      store: m.store,
      now: () => T0 + 1000,
    });
    expect(r.status).toBe(302);
  });

  test("a non-preview forwarded host → 403", async () => {
    const { m, cookie } = await withSession();
    const r = await handlePreviewAuth(
      authReq(`kd_preview=${cookie}`, "maranatha.fockus.dev"),
      { store: m.store, now: () => T0 },
    );
    expect(r.status).toBe(403);
  });

  test("the redirect stays on the preview host for a `//` uri", async () => {
    const m = memoryStore();
    const r = await handlePreviewAuth(authReq(null, HOST, "//evil.example/x"), {
      store: m.store,
    });
    const to = new URL(r.headers.get("location") ?? "").searchParams.get("to");
    expect(new URL(to ?? "").host).toBe(HOST);
  });

  test("the cache answers within a minute, never past the session's expiry", async () => {
    const { m, cookie } = await withSession();
    const cache = new Map<string, number>();
    let calls = 0;
    const counting: PreviewAccessStore = {
      ...m.store,
      findSession: (h, n) => {
        calls++;
        return m.store.findSession(h, n);
      },
    };
    const ask = (now: number) =>
      handlePreviewAuth(authReq(`kd_preview=${cookie}`), {
        store: counting,
        now: () => now,
        cache,
      });
    expect((await ask(T0)).status).toBe(204);
    expect((await ask(T0 + 30_000)).status).toBe(204);
    expect(calls).toBe(1);
    expect((await ask(T0 + 61_000)).status).toBe(204);
    expect(calls).toBe(2);
    const end = T0 + PREVIEW_SESSION_TTL_S * 1000;
    expect((await ask(end - 10_000)).status).toBe(204);
    expect((await ask(end + 1)).status).toBe(302);
  });
});
