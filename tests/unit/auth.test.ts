import { describe, expect, test } from "bun:test";
import { getAuthTables } from "@better-auth/core/db";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { getTableColumns } from "drizzle-orm";
import { authOptions, SESSION_COOKIE } from "../../lib/auth/config";
import {
  ENROL_LINK_TTL_MS,
  ENROL_TOKEN,
  enrolmentLink,
  generateEnrolmentToken,
} from "../../lib/auth/enrolment";
import { clientIp, ROUTES } from "../../lib/auth/handler";
import { AUTH_SCHEMA } from "../../lib/auth/index";
import { dashboardUser } from "../../lib/auth/session";
import { memoryEnrolments, ORIGIN, testAuth } from "./auth-fakes";

/** Every attribute of a Set-Cookie header, lowercased names. */
function attrs(setCookie: string): Map<string, string> {
  const [, ...rest] = setCookie.split(";");
  return new Map(
    rest.map((p) => {
      const [k = "", v = ""] = p.trim().split("=");
      return [k.toLowerCase(), v];
    }),
  );
}

function totpCode(totpURI: string): Promise<string> {
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  const raw = new TextDecoder().decode(base32.decode(secret));
  return createOTP(raw, { digits: 6, period: 30 }).totp();
}

async function enrolled() {
  const t = testAuth();
  const user = await t.seedUser();
  const { token, hash } = generateEnrolmentToken();
  t.enrolments.links.push({
    userId: user.id,
    hash,
    expiresAt: new Date(Date.now() + ENROL_LINK_TTL_MS),
  });
  return { ...t, user, token };
}

describe("schema", () => {
  test("the Drizzle tables have every field Better Auth asks for", () => {
    const tables = getAuthTables(
      authOptions({
        secret: "x".repeat(32),
        baseURL: ORIGIN,
        database: {} as never,
        enrolments: memoryEnrolments().store,
      }),
    );
    for (const [model, def] of Object.entries(tables)) {
      if (model === "rateLimit") continue; // memory storage: no table
      const table = AUTH_SCHEMA[model as keyof typeof AUTH_SCHEMA];
      expect(table, `table for ${model}`).toBeDefined();
      const columns = getTableColumns(table);
      for (const [field, attr] of Object.entries(def.fields)) {
        const name = attr.fieldName ?? field;
        const col = columns[name as keyof typeof columns];
        expect(col, `${model}.${name}`).toBeDefined();
        if (attr.required && attr.defaultValue === undefined)
          expect(col?.notNull, `${model}.${name} not null`).toBe(true);
      }
    }
  });

  test("a short secret is refused", () => {
    expect(() =>
      authOptions({
        secret: "short",
        baseURL: ORIGIN,
        database: {} as never,
        enrolments: memoryEnrolments().store,
      }),
    ).toThrow(/at least 32/);
  });
});

describe("enrolment link", () => {
  test("token shape, and the link carries it in the fragment", () => {
    const { token, hash } = generateEnrolmentToken();
    expect(token).toMatch(ENROL_TOKEN);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(enrolmentLink("deploy.fockus.dev", token)).toBe(
      `https://deploy.fockus.dev/enrol#${token}`,
    );
  });

  test("redeemed once: an enrolment session with a host-only cookie", async () => {
    const t = await enrolled();
    const b = t.browser();
    const res = await b.request("POST", "/kit/enrol", { token: t.token });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      email: "cesar@example.com",
      twoFactorEnabled: false,
    });
    const session = b.setCookies.find((c) =>
      c.startsWith(`${SESSION_COOKIE}=`),
    );
    expect(session).toBeDefined();
    const a = attrs(session ?? "");
    expect(a.has("domain")).toBe(false);
    expect(a.has("secure")).toBe(true);
    expect(a.has("httponly")).toBe(true);
    expect(a.get("samesite")?.toLowerCase()).toBe("lax");
    expect(a.get("path")).toBe("/");
    // A browser session: no Max-Age / Expires, gone when the browser closes.
    expect(a.has("max-age")).toBe(false);

    // Not a dashboard session.
    expect(await dashboardUser(t.auth, b.cookieHeader())).toBeNull();

    const again = await t.browser().request("POST", "/kit/enrol", {
      token: t.token,
    });
    expect(again.status).toBe(401);
  });

  test("an expired, unknown or malformed link is refused and logged", async () => {
    const t = await enrolled();
    const link = t.enrolments.links[0];
    if (link) link.expiresAt = new Date(Date.now() - 1);
    const b = t.browser();
    expect(
      (await b.request("POST", "/kit/enrol", { token: t.token })).status,
    ).toBe(401);
    const other = generateEnrolmentToken().token;
    expect(
      (await b.request("POST", "/kit/enrol", { token: other })).status,
    ).toBe(401);
    expect(
      (await b.request("POST", "/kit/enrol", { token: "nope" })).status,
    ).toBe(401);
    expect(t.logs).toHaveLength(3);
    expect(t.logs[0]).toBe(
      "kit-deploy-auth: failed sign-in from 203.0.113.7 path=/kit/enrol status=401",
    );
    // The token never reaches the log.
    expect(t.logs.join("\n")).not.toContain(t.token);
  });
});

describe("TOTP: enrol, then sign in with it", () => {
  test("enable needs the enrolment session; the code then signs in", async () => {
    const t = await enrolled();
    const anon = t.browser();
    expect(
      (await anon.request("POST", "/two-factor/enable", { method: "totp" }))
        .status,
    ).toBe(403);

    const b = t.browser();
    await b.request("POST", "/kit/enrol", { token: t.token });
    const enable = await b.request("POST", "/two-factor/enable", {
      method: "totp",
    });
    expect(enable.status).toBe(200);
    const { totpURI, backupCodes } = (await enable.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    expect(backupCodes).toHaveLength(10);
    const confirm = await b.request("POST", "/two-factor/verify-totp", {
      code: await totpCode(totpURI),
    });
    expect(confirm.status).toBe(200);
    // Confirming TOTP does not turn the enrolment session into a dashboard one.
    expect(await dashboardUser(t.auth, b.cookieHeader())).toBeNull();

    // A new browser signs in with email + TOTP.
    const phone = t.browser("198.51.100.4");
    const start = await phone.request("POST", "/sign-in/totp", {
      email: "CESAR@example.com ",
    });
    expect(start.status).toBe(200);
    const challenge = phone.setCookies.find((c) =>
      c.startsWith("__Host-kd.two_factor="),
    );
    expect(challenge && attrs(challenge).has("domain")).toBe(false);

    const wrong = await phone.request("POST", "/two-factor/verify-totp", {
      code: "000000",
    });
    expect(wrong.status).toBe(401);
    expect(t.logs.at(-1)).toBe(
      "kit-deploy-auth: failed sign-in from 198.51.100.4 path=/two-factor/verify-totp status=401",
    );

    const ok = await phone.request("POST", "/two-factor/verify-totp", {
      code: await totpCode(totpURI),
    });
    expect(ok.status).toBe(200);
    const user = await dashboardUser(t.auth, phone.cookieHeader());
    expect(user).toEqual({ userId: t.user.id, email: "cesar@example.com" });
    for (const c of phone.setCookies)
      expect(attrs(c).has("domain")).toBe(false);

    // A later link says TOTP is on: /enrol then only adds a passkey.
    const again = generateEnrolmentToken();
    t.enrolments.links.push({
      userId: t.user.id,
      hash: again.hash,
      expiresAt: new Date(Date.now() + ENROL_LINK_TTL_MS),
    });
    const reEnrol = await t
      .browser()
      .request("POST", "/kit/enrol", { token: again.token });
    expect(await reEnrol.json()).toMatchObject({ twoFactorEnabled: true });

    // A dashboard session may not add a factor: only an enrolment one.
    expect(
      (await phone.request("GET", "/passkey/generate-register-options")).status,
    ).toBe(403);
    expect(
      (await phone.request("POST", "/two-factor/enable", { method: "totp" }))
        .status,
    ).toBe(403);

    // A recovery code also signs in, once.
    const laptop = t.browser();
    await laptop.request("POST", "/sign-in/totp", {
      email: "cesar@example.com",
    });
    const code = backupCodes[0] ?? "";
    expect(
      (await laptop.request("POST", "/two-factor/verify-backup-code", { code }))
        .status,
    ).toBe(200);
    expect(await dashboardUser(t.auth, laptop.cookieHeader())).not.toBeNull();
    const reuse = t.browser();
    await reuse.request("POST", "/sign-in/totp", {
      email: "cesar@example.com",
    });
    expect(
      (await reuse.request("POST", "/two-factor/verify-backup-code", { code }))
        .status,
    ).toBe(401);
  });

  test("an unknown email gets the same answer and no session", async () => {
    const t = testAuth();
    const b = t.browser();
    const res = await b.request("POST", "/sign-in/totp", {
      email: "nobody@example.com",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ twoFactorRedirect: true });
    expect(
      (await b.request("POST", "/two-factor/verify-totp", { code: "123456" }))
        .status,
    ).toBe(401);
    expect(await dashboardUser(t.auth, b.cookieHeader())).toBeNull();
  });
});

describe("passkey", () => {
  test("registration options only in an enrolment session, for deploy.fockus.dev", async () => {
    const t = await enrolled();
    const b = t.browser();
    expect(
      (await b.request("GET", "/passkey/generate-register-options")).status,
    ).toBe(403);
    await b.request("POST", "/kit/enrol", { token: t.token });
    const res = await b.request("GET", "/passkey/generate-register-options");
    expect(res.status).toBe(200);
    const o = (await res.json()) as {
      rp: { id: string };
      authenticatorSelection: { userVerification: string; residentKey: string };
    };
    expect(o.rp.id).toBe("deploy.fockus.dev");
    expect(o.authenticatorSelection.userVerification).toBe("required");
    expect(o.authenticatorSelection.residentKey).toBe("required");
    for (const c of b.setCookies) expect(attrs(c).has("domain")).toBe(false);

    // Registering never hands out a dashboard session.
    const create = await b.request("POST", "/passkey/verify-registration", {
      response: {},
      createSession: true,
    });
    expect(create.status).toBe(400);
    expect(await create.json()).toEqual({ code: "CREATE_SESSION_NOT_ALLOWED" });
    expect(await dashboardUser(t.auth, b.cookieHeader())).toBeNull();
  });

  test("sign-in options need no session", async () => {
    const t = testAuth();
    const res = await t
      .browser()
      .request("GET", "/passkey/generate-authenticate-options");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rpId: string }).rpId).toBe(
      "deploy.fockus.dev",
    );
  });
});

describe("closed list of routes", () => {
  test("Better Auth's other routes are 404, wrong methods 405", async () => {
    const t = testAuth();
    const b = t.browser();
    for (const path of [
      "/sign-up/email",
      "/sign-in/email",
      "/sign-in/social",
      "/update-user",
      "/delete-user",
      "/two-factor/disable",
      "/two-factor/get-totp-uri",
      "/passkey/delete-passkey",
      "/request-password-reset",
      "/list-sessions",
    ]) {
      expect((await b.request("POST", path, {})).status, path).toBe(404);
    }
    expect((await b.request("GET", "/sign-out")).status).toBe(405);
    expect(Object.keys(ROUTES)).not.toContain("/sign-up/email");
  });

  test("no session, no dashboard user", async () => {
    const t = testAuth();
    expect(await dashboardUser(t.auth, new Headers())).toBeNull();
    expect(
      await dashboardUser(
        t.auth,
        new Headers({ cookie: `${SESSION_COOKIE}=forged` }),
      ),
    ).toBeNull();
  });
});

describe("rate limit", () => {
  test("sign-in routes answer 429 after 10 tries a minute from one address", async () => {
    const t = testAuth({ rateLimit: true });
    const b = t.browser("192.0.2.9");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push(
        (await b.request("POST", "/sign-in/totp", { email: "x@example.com" }))
          .status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(t.logs.at(-1)).toBe(
      "kit-deploy-auth: failed sign-in from 192.0.2.9 path=/sign-in/totp status=429",
    );
    // Another address is not affected.
    const other = await t
      .browser("192.0.2.10")
      .request("POST", "/sign-in/totp", { email: "x@example.com" });
    expect(other.status).toBe(200);
  });
});

describe("clientIp", () => {
  const req = (xff?: string) =>
    new Request("https://deploy.fockus.dev/api/auth/x", {
      headers: xff ? { "x-forwarded-for": xff } : {},
    });
  test("one plain address, else -", () => {
    expect(clientIp(req("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(req("2001:db8::1"))).toBe("2001:db8::1");
    expect(clientIp(req())).toBe("-");
    expect(clientIp(req("1.2.3.4, 5.6.7.8"))).toBe("-");
    expect(clientIp(req("1.2.3.4 path=/x status=200"))).toBe("-");
  });
});
