/**
 * Eliminar passkey (D055, D056): the action over fakes, the real TOTP check over Better Auth's
 * memory adapter (auth-fakes.ts), and the store against Postgres (opt-in, like db-store.test.ts:
 * KIT_DB_TEST_URL=postgres://… bun test tests/unit/passkey-remove.test.ts).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  ENROL_LINK_TTL_MS,
  generateEnrolmentToken,
} from "../../lib/auth/enrolment";
import { failedLine } from "../../lib/auth/handler";
import {
  betterAuthTotp,
  memoryTotpGuard,
  TOTP_GUARD,
  type TotpVerdict,
} from "../../lib/auth/totp-check";
import type { PasskeyStore, RemovedPasskey } from "../../lib/db/passkeys";
import { drizzlePasskeyStore } from "../../lib/db/passkeys";
import * as schema from "../../lib/db/schema";
import {
  PASSKEY_COPY,
  PASSKEY_REMOVE_PATH,
  type PasskeyDeps,
  removePasskey,
} from "../../lib/panel/actions/passkeys";
import { testAuth } from "./auth-fakes";

const CESAR = { userId: "user-cesar", email: "cesar@example.com" };
const OTHER = "user-other";
const GOOD = "123456";

type Row = { id: string; userId: string; name: string | null };

function fakes(
  opts: { totp?: boolean; verdict?: (code: string) => TotpVerdict } = {},
) {
  let clock = 1_000_000;
  const rows: Row[] = [
    { id: "pk-phone", userId: CESAR.userId, name: "iPhone" },
    { id: "pk-laptop", userId: CESAR.userId, name: null },
    { id: "pk-other", userId: OTHER, name: "Ajena" },
  ];
  const audits: { actor: string; name: string }[] = [];
  const logs: string[] = [];
  const verified: string[] = [];
  const passkeys: PasskeyStore = {
    async remove(userId, id, actor) {
      const i = rows.findIndex((r) => r.id === id && r.userId === userId);
      if (i < 0) return null;
      const [row] = rows.splice(i, 1);
      if (!row) return null;
      audits.push({ actor, name: row.name ?? row.id });
      return { id: row.id, name: row.name } satisfies RemovedPasskey;
    },
  };
  const deps: PasskeyDeps = {
    user: async () => CESAR,
    passkeys,
    totpEnabled: async () => opts.totp ?? true,
    verifyTotp: async (_userId, code) => {
      verified.push(code);
      // A real check takes a moment: lets parallel requests overlap.
      await Promise.resolve();
      return opts.verdict
        ? opts.verdict(code)
        : code === GOOD
          ? "ok"
          : "invalid";
    },
    guard: memoryTotpGuard({ now: () => clock }),
    clientIp: async () => "203.0.113.7",
    log: (l) => logs.push(l),
    revalidate: () => {},
  };
  const form = (id: string, code: string) => ({ id, code });
  return {
    deps,
    rows,
    audits,
    logs,
    verified,
    form,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

describe("Eliminar passkey (action)", () => {
  test("a right code removes that passkey of that user, with its audit row", async () => {
    const f = fakes();
    const res = await removePasskey(f.deps, f.form("pk-phone", "123 456"));
    expect(res).toEqual({
      ok: true,
      id: "pk-phone",
      removed: true,
      name: "iPhone",
    });
    expect(f.rows.map((r) => r.id)).toEqual(["pk-laptop", "pk-other"]);
    expect(f.audits).toEqual([{ actor: "web:user-cesar", name: "iPhone" }]);
    expect(f.logs).toEqual([]);
  });

  test("a wrong code deletes nothing and leaves the fail2ban line", async () => {
    const f = fakes();
    const res = await removePasskey(f.deps, f.form("pk-phone", "654321"));
    expect(res).toMatchObject({
      ok: false,
      code: "confirmation",
      fields: { code: PASSKEY_COPY.wrongCodeField },
    });
    expect(f.rows).toHaveLength(3);
    expect(f.audits).toEqual([]);
    expect(f.logs).toEqual([
      failedLine("203.0.113.7", PASSKEY_REMOVE_PATH, 401),
    ]);
    // The code is in no result and no log line.
    expect(JSON.stringify(res)).not.toContain("654321");
    expect(f.logs.join("\n")).not.toContain("654321");
  });

  test("another user's passkey id: nothing deleted, same answer as one already gone", async () => {
    const f = fakes();
    const res = await removePasskey(f.deps, f.form("pk-other", GOOD));
    expect(res).toEqual({
      ok: true,
      id: "pk-other",
      removed: false,
      name: null,
    });
    expect(f.rows).toHaveLength(3);
    expect(f.audits).toEqual([]);
  });

  test("a code that already confirmed a removal is refused while it could still be valid", async () => {
    const f = fakes();
    expect(await removePasskey(f.deps, f.form("pk-phone", GOOD))).toMatchObject(
      { ok: true },
    );
    const again = await removePasskey(f.deps, f.form("pk-laptop", GOOD));
    expect(again).toMatchObject({
      ok: false,
      code: "confirmation",
      message: PASSKEY_COPY.reused,
    });
    expect(f.rows.map((r) => r.id)).toEqual(["pk-laptop", "pk-other"]);
    // Checked once: the second never reached the verifier.
    expect(f.verified).toEqual([GOOD]);
    f.tick(TOTP_GUARD.reuseMs + 1);
    expect(
      await removePasskey(f.deps, f.form("pk-laptop", GOOD)),
    ).toMatchObject({
      ok: true,
      removed: true,
    });
  });

  test("five wrong codes block the sixth try, even a right one, for 15 minutes", async () => {
    const f = fakes();
    for (let i = 0; i < TOTP_GUARD.maxFailures; i++)
      await removePasskey(f.deps, f.form("pk-phone", `00000${i}`));
    const blocked = await removePasskey(f.deps, f.form("pk-phone", GOOD));
    expect(blocked).toMatchObject({ ok: false, code: "too_many", status: 429 });
    expect(f.rows).toHaveLength(3);
    expect(f.logs.at(-1)).toBe(
      failedLine("203.0.113.7", PASSKEY_REMOVE_PATH, 429),
    );
    expect(f.verified).not.toContain(GOOD);
    f.tick(TOTP_GUARD.windowMs + 1);
    expect(await removePasskey(f.deps, f.form("pk-phone", GOOD))).toMatchObject(
      {
        ok: true,
        removed: true,
      },
    );
  });

  test("a right code clears the count of earlier wrong ones", async () => {
    const f = fakes();
    for (let i = 0; i < TOTP_GUARD.maxFailures - 1; i++)
      await removePasskey(f.deps, f.form("pk-phone", `00000${i}`));
    await removePasskey(f.deps, f.form("pk-phone", GOOD));
    for (let i = 0; i < TOTP_GUARD.maxFailures - 1; i++)
      await removePasskey(f.deps, f.form("pk-laptop", `11111${i}`));
    f.tick(TOTP_GUARD.reuseMs + 1);
    expect(
      await removePasskey(f.deps, f.form("pk-laptop", GOOD)),
    ).toMatchObject({
      ok: true,
      removed: true,
    });
  });

  test("a burst of parallel guesses cannot pass the limit", async () => {
    const f = fakes();
    const codes = Array.from({ length: 30 }, (_, i) => String(100000 + i));
    const results = await Promise.all(
      codes.map((c) => removePasskey(f.deps, f.form("pk-phone", c))),
    );
    expect(f.verified).toHaveLength(TOTP_GUARD.maxFailures);
    expect(results.filter((r) => !r.ok && r.code === "too_many")).toHaveLength(
      codes.length - TOTP_GUARD.maxFailures,
    );
    expect(f.rows).toHaveLength(3);
  });

  test("the same code sent twice at once is checked once", async () => {
    const f = fakes();
    const [a, b] = await Promise.all([
      removePasskey(f.deps, f.form("pk-phone", GOOD)),
      removePasskey(f.deps, f.form("pk-laptop", GOOD)),
    ]);
    expect([a?.ok, b?.ok].sort()).toEqual([false, true]);
    expect(f.verified).toEqual([GOOD]);
    expect(f.rows).toHaveLength(2);
  });

  test("no session, no TOTP, a malformed code: refused before any check", async () => {
    const none = fakes();
    none.deps.user = async () => null;
    expect(
      await removePasskey(none.deps, none.form("pk-phone", GOOD)),
    ).toMatchObject({
      ok: false,
      code: "unauthorized",
    });

    const noTotp = fakes({ totp: false });
    expect(
      await removePasskey(noTotp.deps, noTotp.form("pk-phone", GOOD)),
    ).toMatchObject({
      ok: false,
      code: "conflict",
      message: PASSKEY_COPY.noTotp,
    });

    const bad = fakes();
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      expect(
        await removePasskey(bad.deps, bad.form("pk-phone", code)),
      ).toMatchObject({
        ok: false,
        code: "invalid",
        fields: { code: "Escribe los 6 dígitos de tu app." },
      });
    }
    expect(
      await removePasskey(bad.deps, { code: GOOD, id: "x'; drop" }),
    ).toMatchObject({
      ok: false,
      code: "invalid",
      fields: { id: "Passkey no válida." },
    });
    expect(await removePasskey(bad.deps, "not a form")).toMatchObject({
      ok: false,
      code: "invalid",
    });

    for (const f of [none, noTotp, bad]) {
      expect(f.verified).toEqual([]);
      expect(f.rows).toHaveLength(3);
    }
  });

  test("a verifier that throws frees the code and deletes nothing", async () => {
    const f = fakes();
    f.deps.verifyTotp = async () => {
      throw new Error("database down");
    };
    expect(await removePasskey(f.deps, f.form("pk-phone", GOOD))).toMatchObject(
      {
        ok: false,
        code: "failed",
      },
    );
    expect(f.rows).toHaveLength(3);
    f.deps.verifyTotp = async () => "ok";
    expect(await removePasskey(f.deps, f.form("pk-phone", GOOD))).toMatchObject(
      { ok: true },
    );
  });
});

// ── The real check: Better Auth's verify-totp with the request's session ──

function totpCode(totpURI: string): Promise<string> {
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  const raw = new TextDecoder().decode(base32.decode(secret));
  return createOTP(raw, { digits: 6, period: 30 }).totp();
}

/** A user enrolled with TOTP, signed in on a "phone" with email + code (auth.test.ts's flow). */
async function signedIn() {
  const t = testAuth();
  const user = await t.seedUser();
  const { token, hash } = generateEnrolmentToken();
  t.enrolments.links.push({
    userId: user.id,
    hash,
    expiresAt: new Date(Date.now() + ENROL_LINK_TTL_MS),
  });
  const b = t.browser();
  await b.request("POST", "/kit/enrol", { token });
  const enable = await b.request("POST", "/two-factor/enable", {
    method: "totp",
  });
  const { totpURI } = (await enable.json()) as { totpURI: string };
  await b.request("POST", "/two-factor/verify-totp", {
    code: await totpCode(totpURI),
  });
  const phone = t.browser();
  await phone.request("POST", "/sign-in/totp", { email: user.email });
  const signIn = await phone.request("POST", "/two-factor/verify-totp", {
    code: await totpCode(totpURI),
  });
  expect(signIn.status).toBe(200);
  return { t, user, phone, totpURI };
}

describe("betterAuthTotp (Better Auth's verify-totp, server-side)", () => {
  test("right code → ok; wrong → invalid; no session → invalid; another user → invalid", async () => {
    const { t, user, phone, totpURI } = await signedIn();
    const check = betterAuthTotp(
      () => t.auth,
      async () => phone.cookieHeader(),
    );
    expect(await check(user.id, "000000")).toBe("invalid");
    const code = await totpCode(totpURI);
    expect(await check(user.id, code)).toBe("ok");
    // Better Auth keeps no record of used codes: the same one passes again inside its window
    // (memoryTotpGuard is what refuses a reuse, D055).
    expect(await check(user.id, code)).toBe("ok");
    expect(await check("someone-else", code)).toBe("invalid");

    const anon = betterAuthTotp(
      () => t.auth,
      async () => new Headers(),
    );
    expect(await anon(user.id, code)).toBe("invalid");
    // Nothing of that reached the fail2ban log by itself: the action writes its own line.
    expect(t.logs.filter((l) => l.includes(PASSKEY_REMOVE_PATH))).toEqual([]);
  });

  test("a signed-in user without TOTP → not_enabled", async () => {
    const { t, user, phone } = await signedIn();
    t.db.twoFactor?.splice(0);
    const check = betterAuthTotp(
      () => t.auth,
      async () => phone.cookieHeader(),
    );
    expect(await check(user.id, "123456")).toBe("not_enabled");
  });
});

// ── The store against Postgres (opt-in) ──

const url = process.env.KIT_DB_TEST_URL;

describe.skipIf(!url)("passkey store (Postgres)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "drizzle" });
  });
  afterAll(() => client.end());

  test("deletes only the owner's passkey and writes passkey.remove with its name", async () => {
    const now = new Date();
    for (const id of ["u1", "u2"])
      await db.insert(schema.authUser).values({
        id,
        name: id,
        email: `${id}@example.com`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    const key = (id: string, userId: string, name: string | null) => ({
      id,
      name,
      userId,
      publicKey: "pk",
      credentialID: `cred-${id}`,
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
    });
    await db
      .insert(schema.authPasskey)
      .values([
        key("a", "u1", "iPhone"),
        key("b", "u2", null),
        key("c", "u1", null),
      ]);
    const store = drizzlePasskeyStore(db);

    expect(await store.remove("u1", "b", "web:u1")).toBeNull();
    expect(await store.remove("u1", "a", "web:u1")).toEqual({
      id: "a",
      name: "iPhone",
    });
    expect(await store.remove("u1", "a", "web:u1")).toBeNull();
    expect(await store.remove("u1", "c", "web:u1")).toEqual({
      id: "c",
      name: null,
    });

    const left = await db
      .select({ id: schema.authPasskey.id })
      .from(schema.authPasskey);
    expect(left).toEqual([{ id: "b" }]);
    const audit = await db
      .select({
        actor: schema.auditLog.actor,
        project: schema.auditLog.project,
        name: schema.auditLog.name,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "passkey.remove"));
    expect(audit).toEqual([
      { actor: "web:u1", project: "-", name: "iPhone" },
      { actor: "web:u1", project: "-", name: "c" },
    ]);
  });
});
