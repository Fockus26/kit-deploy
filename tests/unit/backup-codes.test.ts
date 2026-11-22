/**
 * Ver códigos / Generar nuevos (D067): the actions over fakes (passkey-remove.test.ts's model),
 * and the real Better Auth calls over its memory adapter (auth-fakes.ts).
 */
import { describe, expect, test } from "bun:test";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import {
  ENROL_LINK_TTL_MS,
  generateEnrolmentToken,
} from "../../lib/auth/enrolment";
import { failedLine } from "../../lib/auth/handler";
import {
  memoryTotpGuard,
  TOTP_GUARD,
  type TotpVerdict,
} from "../../lib/auth/totp-check";
import type { AuditEntry } from "../../lib/db/audit";
import {
  BACKUP_CODES_COPY,
  BACKUP_CODES_PATH,
  type BackupCodesDeps,
  regenerateBackupCodes,
  viewBackupCodes,
} from "../../lib/panel/actions/backup-codes";
import {
  PASSKEY_REMOVE_PATH,
  removePasskey,
} from "../../lib/panel/actions/passkeys";
import {
  type BackupCodesApi,
  betterAuthBackupCodes,
} from "../../lib/panel/backup-codes-runtime";
import { testAuth } from "./auth-fakes";

const CESAR = { userId: "user-cesar", email: "cesar@example.com" };
const GOOD = "123456";
const STORED = ["aaaaa-bbbbbbb", "ccccc-ddddddd"];
const FRESH = Array.from({ length: 10 }, (_, i) => `newcd-${i}000000`);

function fakes(
  opts: {
    totp?: boolean;
    verdict?: (code: string) => TotpVerdict;
    stored?: string[] | null;
  } = {},
) {
  let clock = 1_000_000;
  let stored: string[] | null =
    opts.stored === undefined ? [...STORED] : opts.stored;
  const audits: AuditEntry[] = [];
  const logs: string[] = [];
  const verified: string[] = [];
  const calls: string[] = [];
  const guard = memoryTotpGuard({ now: () => clock });
  const deps: BackupCodesDeps = {
    user: async () => CESAR,
    codes: {
      async view(userId) {
        calls.push(`view:${userId}`);
        return stored ? [...stored] : null;
      },
      async regenerate() {
        calls.push("regenerate");
        if (!stored) return null;
        stored = [...FRESH];
        return [...stored];
      },
    },
    audit: {
      async record(e) {
        audits.push(e);
      },
    },
    totpEnabled: async () => opts.totp ?? true,
    verifyTotp: async (_userId, code) => {
      verified.push(code);
      await Promise.resolve();
      return opts.verdict
        ? opts.verdict(code)
        : code === GOOD
          ? "ok"
          : "invalid";
    },
    guard,
    clientIp: async () => "203.0.113.7",
    log: (l) => logs.push(l),
    revalidate: () => {},
  };
  return {
    deps,
    guard,
    audits,
    logs,
    verified,
    calls,
    stored: () => stored,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

describe("Ver códigos (action)", () => {
  test("a right code returns the remaining codes, with its audit row (no name)", async () => {
    const f = fakes();
    const res = await viewBackupCodes(f.deps, { code: "123 456" });
    expect(res).toEqual({ ok: true, kind: "view", codes: STORED });
    expect(f.calls).toEqual([`view:${CESAR.userId}`]);
    expect(f.audits).toEqual([
      { actor: "web:user-cesar", action: "backup_codes.view", project: "-" },
    ]);
    expect(f.logs).toEqual([]);
  });

  test("every code used → an empty list, not an error", async () => {
    const f = fakes({ stored: [] });
    expect(await viewBackupCodes(f.deps, { code: GOOD })).toEqual({
      ok: true,
      kind: "view",
      codes: [],
    });
  });

  test("a wrong code shows nothing and leaves the fail2ban line", async () => {
    const f = fakes();
    const res = await viewBackupCodes(f.deps, { code: "654321" });
    expect(res).toMatchObject({
      ok: false,
      code: "confirmation",
      fields: { code: BACKUP_CODES_COPY.wrongCodeField },
    });
    expect(f.calls).toEqual([]);
    expect(f.audits).toEqual([]);
    expect(f.logs).toEqual([failedLine("203.0.113.7", BACKUP_CODES_PATH, 401)]);
    const text = JSON.stringify(res) + f.logs.join("\n");
    expect(text).not.toContain("654321");
    for (const c of STORED) expect(text).not.toContain(c);
  });

  test("a reused code is refused before the verifier", async () => {
    const f = fakes();
    expect(await viewBackupCodes(f.deps, { code: GOOD })).toMatchObject({
      ok: true,
    });
    expect(await viewBackupCodes(f.deps, { code: GOOD })).toMatchObject({
      ok: false,
      code: "confirmation",
      message: BACKUP_CODES_COPY.reused,
    });
    expect(f.verified).toEqual([GOOD]);
    expect(f.calls).toHaveLength(1);
  });

  test("five wrong codes block the sixth, even a right one", async () => {
    const f = fakes();
    for (let i = 0; i < TOTP_GUARD.maxFailures; i++)
      await viewBackupCodes(f.deps, { code: `00000${i}` });
    const blocked = await viewBackupCodes(f.deps, { code: GOOD });
    expect(blocked).toMatchObject({ ok: false, code: "too_many", status: 429 });
    expect(f.logs.at(-1)).toBe(
      failedLine("203.0.113.7", BACKUP_CODES_PATH, 429),
    );
    expect(f.calls).toEqual([]);
    f.tick(TOTP_GUARD.windowMs + 1);
    expect(await viewBackupCodes(f.deps, { code: GOOD })).toMatchObject({
      ok: true,
    });
  });

  test("no session, no TOTP, a malformed code: refused before any check", async () => {
    const none = fakes();
    none.deps.user = async () => null;
    expect(await viewBackupCodes(none.deps, { code: GOOD })).toMatchObject({
      ok: false,
      code: "unauthorized",
    });

    const noTotp = fakes({ totp: false });
    expect(await viewBackupCodes(noTotp.deps, { code: GOOD })).toMatchObject({
      ok: false,
      code: "conflict",
      message: BACKUP_CODES_COPY.noTotp,
    });

    const bad = fakes();
    for (const code of ["12345", "1234567", "abcdef", ""])
      expect(await viewBackupCodes(bad.deps, { code })).toMatchObject({
        ok: false,
        code: "invalid",
        fields: { code: "Escribe los 6 dígitos de tu app." },
      });
    expect(await regenerateBackupCodes(bad.deps, "not a form")).toMatchObject({
      ok: false,
      code: "invalid",
    });

    for (const f of [none, noTotp, bad]) {
      expect(f.verified).toEqual([]);
      expect(f.calls).toEqual([]);
      expect(f.audits).toEqual([]);
    }
  });

  test("no second factor row → refused, nothing audited", async () => {
    const f = fakes({ stored: null });
    expect(await viewBackupCodes(f.deps, { code: GOOD })).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(f.audits).toEqual([]);
  });

  test("an audit write that fails shows no codes", async () => {
    const f = fakes();
    f.deps.audit = {
      record: async () => {
        throw new Error("database down");
      },
    };
    const res = await viewBackupCodes(f.deps, { code: GOOD });
    expect(res).toMatchObject({ ok: false, code: "failed" });
    for (const c of STORED) expect(JSON.stringify(res)).not.toContain(c);
  });
});

describe("Generar nuevos (action)", () => {
  test("a right code replaces the codes and returns the ten new ones, audited", async () => {
    const f = fakes();
    const res = await regenerateBackupCodes(f.deps, { code: GOOD });
    expect(res).toEqual({ ok: true, kind: "regenerate", codes: FRESH });
    expect(f.stored()).toEqual(FRESH);
    expect(f.audits).toEqual([
      {
        actor: "web:user-cesar",
        action: "backup_codes.regenerate",
        project: "-",
      },
    ]);
  });

  test("a wrong code replaces nothing", async () => {
    const f = fakes();
    expect(
      await regenerateBackupCodes(f.deps, { code: "000000" }),
    ).toMatchObject({ ok: false, code: "confirmation" });
    expect(f.stored()).toEqual(STORED);
    expect(f.calls).toEqual([]);
    expect(f.logs).toEqual([failedLine("203.0.113.7", BACKUP_CODES_PATH, 401)]);
  });

  test("a double submit with the same code regenerates once", async () => {
    const f = fakes();
    const [a, b] = await Promise.all([
      regenerateBackupCodes(f.deps, { code: GOOD }),
      regenerateBackupCodes(f.deps, { code: GOOD }),
    ]);
    expect([a?.ok, b?.ok].sort()).toEqual([false, true]);
    expect(f.calls).toEqual(["regenerate"]);
    expect(f.audits).toHaveLength(1);
  });

  test("a failed audit write still returns the new codes (the old ones are gone)", async () => {
    const f = fakes();
    f.deps.audit = {
      record: async () => {
        throw new Error("database down");
      },
    };
    const res = await regenerateBackupCodes(f.deps, { code: GOOD });
    expect(res).toEqual({ ok: true, kind: "regenerate", codes: FRESH });
  });

  test("a verifier that throws frees the code and replaces nothing", async () => {
    const f = fakes();
    f.deps.verifyTotp = async () => {
      throw new Error("database down");
    };
    expect(await regenerateBackupCodes(f.deps, { code: GOOD })).toMatchObject({
      ok: false,
      code: "failed",
    });
    expect(f.stored()).toEqual(STORED);
    f.deps.verifyTotp = async () => "ok";
    expect(await regenerateBackupCodes(f.deps, { code: GOOD })).toMatchObject({
      ok: true,
    });
  });
});

describe("the shared guard (D067)", () => {
  test("a code that removed a passkey cannot then show or replace the codes", async () => {
    const f = fakes();
    const removed = await removePasskey(
      {
        user: f.deps.user,
        passkeys: { remove: async (_u, id) => ({ id, name: null }) },
        totpEnabled: f.deps.totpEnabled,
        verifyTotp: f.deps.verifyTotp,
        guard: f.guard,
        clientIp: f.deps.clientIp,
        log: f.deps.log,
        revalidate: () => {},
      },
      { id: "pk-phone", code: GOOD },
    );
    expect(removed).toMatchObject({ ok: true });
    expect(await viewBackupCodes(f.deps, { code: GOOD })).toMatchObject({
      ok: false,
      message: BACKUP_CODES_COPY.reused,
    });
    expect(f.calls).toEqual([]);
  });

  test("wrong codes on both actions count toward one limit", async () => {
    const f = fakes();
    const passkeyDeps = {
      user: f.deps.user,
      passkeys: { remove: async () => null },
      totpEnabled: f.deps.totpEnabled,
      verifyTotp: f.deps.verifyTotp,
      guard: f.guard,
      clientIp: f.deps.clientIp,
      log: f.deps.log,
      revalidate: () => {},
    };
    for (let i = 0; i < 3; i++)
      await removePasskey(passkeyDeps, { id: "pk", code: `11111${i}` });
    for (let i = 0; i < TOTP_GUARD.maxFailures - 3; i++)
      await viewBackupCodes(f.deps, { code: `22222${i}` });
    expect(await regenerateBackupCodes(f.deps, { code: GOOD })).toMatchObject({
      ok: false,
      code: "too_many",
    });
    expect(f.logs.filter((l) => l.includes(PASSKEY_REMOVE_PATH))).toHaveLength(
      3,
    );
  });
});

// ── The real calls: Better Auth's view-backup-codes and generate-backup-codes ──

function totpCode(totpURI: string): Promise<string> {
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  const raw = new TextDecoder().decode(base32.decode(secret));
  return createOTP(raw, { digits: 6, period: 30 }).totp();
}

/** A user enrolled with TOTP (its ten codes from enable), signed in on a "phone". */
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
  const { totpURI, backupCodes } = (await enable.json()) as {
    totpURI: string;
    backupCodes: string[];
  };
  await b.request("POST", "/two-factor/verify-totp", {
    code: await totpCode(totpURI),
  });
  const phone = t.browser();
  await phone.request("POST", "/sign-in/totp", { email: user.email });
  const signIn = await phone.request("POST", "/two-factor/verify-totp", {
    code: await totpCode(totpURI),
  });
  expect(signIn.status).toBe(200);
  return { t, user, phone, backupCodes };
}

describe("betterAuthBackupCodes (Better Auth, server-side)", () => {
  test("view decrypts the stored codes; regenerate replaces them for the session's user", async () => {
    const { t, user, phone, backupCodes } = await signedIn();
    const source = betterAuthBackupCodes(
      () => t.auth as unknown as BackupCodesApi,
      async () => phone.cookieHeader(),
    );
    expect(backupCodes).toHaveLength(10);
    expect(await source.view(user.id)).toEqual(backupCodes);

    const fresh = await source.regenerate();
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toEqual(backupCodes);
    expect(await source.view(user.id)).toEqual(fresh);
    // The old ones stop working.
    const old = backupCodes[0] ?? "";
    const laptop = t.browser();
    await laptop.request("POST", "/sign-in/totp", { email: user.email });
    const res = await laptop.request("POST", "/two-factor/verify-backup-code", {
      code: old,
    });
    expect(res.status).not.toBe(200);
  });

  test("no second factor → null; no session → regenerate throws", async () => {
    const { t, user, phone } = await signedIn();
    const anon = betterAuthBackupCodes(
      () => t.auth as unknown as BackupCodesApi,
      async () => new Headers(),
    );
    await expect(anon.regenerate()).rejects.toBeDefined();
    t.db.twoFactor?.splice(0);
    const source = betterAuthBackupCodes(
      () => t.auth as unknown as BackupCodesApi,
      async () => phone.cookieHeader(),
    );
    expect(await source.view(user.id)).toBeNull();
  });
});
