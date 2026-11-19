/**
 * Ajustes › Passkeys › Eliminar (D055, D056). The dashboard session is not enough: a fresh code
 * from the account's authenticator app is checked on the server first, and only then is the
 * passkey deleted — that user's only (id and user id in the WHERE), with its audit row.
 *
 * Order: session → form → limit/reuse guard → TOTP on? → the code → delete. A wrong code leaves
 * a `kit-deploy-auth: failed sign-in …` line, the one the fail2ban jail matches (D003). The code
 * never reaches a result, a message or a log line.
 */
import { failedLine } from "@/lib/auth/handler";
import type { TotpGuard, TotpVerifier } from "@/lib/auth/totp-check";
import { webActor } from "@/lib/db/env-store";
import type { PasskeyStore } from "@/lib/db/passkeys";
import { passkeyRemoveSchema } from "@/lib/panel/schemas";
import {
  type ActionResult,
  failure,
  runAction,
  type SessionSource,
} from "./core";

export type PasskeyDeps = SessionSource & {
  passkeys: PasskeyStore;
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
export const PASSKEY_REMOVE_PATH = "/panel/passkey-remove";

/* PLACEHOLDER (CONTENT_CHECKLIST row 42): the dialog's error and notice texts are provisional. */
export const PASSKEY_COPY = {
  wrongCode:
    "El código no coincide. Escribe el que muestra ahora tu app de autenticación; si sigue fallando, revisa que la hora del teléfono sea automática.",
  wrongCodeField: "El código no coincide.",
  reused:
    "Ese código ya se usó. Espera a que tu app muestre el siguiente y escríbelo.",
  reusedField: "Ese código ya se usó.",
  tooMany:
    "Demasiados códigos incorrectos. Espera 15 minutos antes de volver a intentarlo.",
  noTotp:
    "Tu cuenta no tiene app de autenticación, así que no hay con qué confirmar. Configúrala con un enlace de alta y vuelve a intentarlo.",
} as const;

export type PasskeyRemoveResult = ActionResult<{
  id: string;
  /** False when it was not there any more (a second submit, or not this account's). */
  removed: boolean;
  /** Its name, for the notice; null when it had none or was not removed. */
  name: string | null;
}>;

export async function removePasskey(
  deps: PasskeyDeps,
  raw: unknown,
): Promise<PasskeyRemoveResult> {
  return runAction(
    deps,
    passkeyRemoveSchema,
    raw,
    // `quiet`: the input holds a code; nothing about it is ever logged.
    { action: "passkey.remove", quiet: true },
    async ({ id, code }, user) => {
      const refused = async (status: number) =>
        deps.log(
          failedLine(await deps.clientIp(), PASSKEY_REMOVE_PATH, status),
        );

      if (!(await deps.totpEnabled(user.userId)))
        return failure("conflict", PASSKEY_COPY.noTotp);

      const gate = deps.guard.attempt(user.userId, code);
      if (gate === "blocked") {
        await refused(429);
        return failure("too_many", PASSKEY_COPY.tooMany);
      }
      if (gate === "reused")
        return failure("confirmation", PASSKEY_COPY.reused, {
          code: PASSKEY_COPY.reusedField,
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
          return failure("conflict", PASSKEY_COPY.noTotp);
        await refused(401);
        return failure("confirmation", PASSKEY_COPY.wrongCode, {
          code: PASSKEY_COPY.wrongCodeField,
        });
      }
      deps.guard.succeeded(user.userId);

      const row = await deps.passkeys.remove(
        user.userId,
        id,
        webActor(user.userId),
      );
      deps.revalidate("/settings");
      return { ok: true, id, removed: row !== null, name: row?.name ?? null };
    },
  );
}
