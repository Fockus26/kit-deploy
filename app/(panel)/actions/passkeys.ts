"use server";
/**
 * Ajustes › Passkeys › Eliminar (D055), confirmed with a fresh TOTP code. For
 * `useActionState(action, null)`; the logic is lib/panel/actions/passkeys.ts.
 */
import { payload } from "@/lib/panel/actions/form";
import {
  type PasskeyRemoveResult,
  removePasskey,
} from "@/lib/panel/actions/passkeys";
import { passkeyDeps } from "@/lib/panel/passkey-runtime";

export async function removePasskeyAction(
  _prev: unknown,
  form: FormData,
): Promise<PasskeyRemoveResult> {
  return removePasskey(passkeyDeps(), payload(form));
}
