/**
 * Ajustes › Códigos de recuperación › Ver códigos / Generar nuevos (D067). Like Eliminar passkey
 * (D055): the dashboard session is not enough, a fresh code from the account's authenticator
 * app is checked on the server first, through the guard every code-confirmed action shares
 * (lib/panel/totp-guard.ts), and only then are the codes read or replaced.
 *
 * Order: session → form → TOTP on? → limit/reuse guard → the code → view or regenerate, and its
 * audit row (`backup_codes.view` / `backup_codes.regenerate`, project `-`, no name). The recovery
 * codes travel only in this result — the dialog's action state — never in a URL, a cookie, a
 * cache, a log line or the audit row; neither does the TOTP code.
 */
import { failedLine } from "@/lib/auth/handler";
import type { DashboardUser } from "@/lib/auth/session";
import type { TotpGuard, TotpVerifier } from "@/lib/auth/totp-check";
import { ACCOUNT_AUDIT_PROJECT } from "@/lib/db/account-scope";
import type { AuditStore } from "@/lib/db/audit";
import { webActor } from "@/lib/db/env-store";
import { PASSKEY_COPY } from "@/lib/panel/actions/passkeys";
import { backupCodesSchema } from "@/lib/panel/schemas";
import {
  type ActionFailure,
  type ActionResult,
  failure,
  runAction,
  type SessionSource,
} from "./core";

/** Better Auth's recovery codes of the session's user (lib/panel/backup-codes-runtime.ts). */
export interface BackupCodesSource {
  /** The codes not used yet; empty when every one was spent. Null: the account has no
   * second factor row at all (nothing to show). */
  view(userId: string): Promise<string[] | null>;
  /** Ten new codes for the session's user; the old ones stop working. Null: no second factor. */
  regenerate(): Promise<string[] | null>;
}

export type BackupCodesDeps = SessionSource & {
  codes: BackupCodesSource;
  audit: AuditStore;
  /** The account has a confirmed authenticator app (`auth_user.two_factor_enabled`). */
  totpEnabled(userId: string): Promise<boolean>;
  verifyTotp: TotpVerifier;
  guard: TotpGuard;
  /** The client's address as Caddy forwarded it, "-" without one. */
  clientIp(): Promise<string>;
  log(line: string): void;
  revalidate(path: string): void;
};

/** The `path=` of the failed line: not an HTTP route, so the jail can tell it apart. */
export const BACKUP_CODES_PATH = "/panel/backup-codes";

/* PLACEHOLDER (CONTENT_CHECKLIST row 47): the dialog's error texts are provisional; the code
 * ones are Eliminar passkey's, the same check. */
export const BACKUP_CODES_COPY = {
  ...PASSKEY_COPY,
  noTotp:
    "Tu cuenta no tiene app de autenticación, así que no hay con qué confirmar ni códigos de recuperación. Configúrala con un enlace de alta.",
} as const;

export type BackupCodesResult = ActionResult<{
  /** What was done: the dialog words the list after it. */
  kind: "view" | "regenerate";
  /** The codes, shown once in the dialog. Empty after a view: every one was used. */
  codes: string[];
}>;

type Kind = "view" | "regenerate";

export function viewBackupCodes(
  deps: BackupCodesDeps,
  raw: unknown,
): Promise<BackupCodesResult> {
  return confirmed(deps, raw, "view");
}

export function regenerateBackupCodes(
  deps: BackupCodesDeps,
  raw: unknown,
): Promise<BackupCodesResult> {
  return confirmed(deps, raw, "regenerate");
}

async function confirmed(
  deps: BackupCodesDeps,
  raw: unknown,
  kind: Kind,
): Promise<BackupCodesResult> {
  return runAction(
    deps,
    backupCodesSchema,
    raw,
    // `quiet`: the input holds a code and the result holds the recovery codes; nothing about
    // either is ever logged.
    { action: `backup_codes.${kind}`, quiet: true },
    async ({ code }, user) => {
      const refused = await checkCode(deps, user, code);
      if (refused) return refused;

      if (kind === "view") {
        const codes = await deps.codes.view(user.userId);
        if (codes === null)
          return failure("conflict", BACKUP_CODES_COPY.noTotp);
        // The row first: codes are never shown without their trace.
        await deps.audit.record(entry(user, "backup_codes.view"));
        deps.revalidate("/settings");
        return { ok: true, kind, codes };
      }

      const codes = await deps.codes.regenerate();
      if (codes === null) return failure("conflict", BACKUP_CODES_COPY.noTotp);
      // Better Auth wrote the new codes through its own adapter, outside any transaction of
      // ours (D067): the old ones are already dead, so a failed audit write must not lose the
      // new ones — it is reported in the panel's log (without a code) and the codes still go.
      try {
        await deps.audit.record(entry(user, "backup_codes.regenerate"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("panel action backup_codes.regenerate: audit:", msg);
      }
      deps.revalidate("/settings");
      return { ok: true, kind, codes };
    },
  );
}

function entry(
  user: DashboardUser,
  action: "backup_codes.view" | "backup_codes.regenerate",
) {
  return {
    actor: webActor(user.userId),
    action,
    project: ACCOUNT_AUDIT_PROJECT,
  };
}

/** Eliminar passkey's checks, in its order (D055): null when the code confirms. */
async function checkCode(
  deps: BackupCodesDeps,
  user: DashboardUser,
  code: string,
): Promise<ActionFailure | null> {
  const refused = async (status: number) =>
    deps.log(failedLine(await deps.clientIp(), BACKUP_CODES_PATH, status));

  if (!(await deps.totpEnabled(user.userId)))
    return failure("conflict", BACKUP_CODES_COPY.noTotp);

  const gate = deps.guard.attempt(user.userId, code);
  if (gate === "blocked") {
    await refused(429);
    return failure("too_many", BACKUP_CODES_COPY.tooMany);
  }
  if (gate === "reused")
    return failure("confirmation", BACKUP_CODES_COPY.reused, {
      code: BACKUP_CODES_COPY.reusedField,
    });

  let verdict: Awaited<ReturnType<TotpVerifier>>;
  try {
    verdict = await deps.verifyTotp(user.userId, code);
  } catch (e) {
    deps.guard.failed(user.userId, code);
    throw e;
  }
  if (verdict !== "ok") {
    deps.guard.failed(user.userId, code);
    if (verdict === "not_enabled")
      return failure("conflict", BACKUP_CODES_COPY.noTotp);
    await refused(401);
    return failure("confirmation", BACKUP_CODES_COPY.wrongCode, {
      code: BACKUP_CODES_COPY.wrongCodeField,
    });
  }
  deps.guard.succeeded(user.userId);
  return null;
}
