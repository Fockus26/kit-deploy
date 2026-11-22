"use server";
/**
 * Ajustes › Códigos de recuperación › Ver códigos / Generar nuevos (D067), confirmed with a
 * fresh TOTP code. For `useActionState(action, null)`; the logic is
 * lib/panel/actions/backup-codes.ts. The codes come back only in the result.
 */
import {
  type BackupCodesResult,
  regenerateBackupCodes,
  viewBackupCodes,
} from "@/lib/panel/actions/backup-codes";
import { payload } from "@/lib/panel/actions/form";
import { backupCodesDeps } from "@/lib/panel/backup-codes-runtime";

export async function viewBackupCodesAction(
  _prev: unknown,
  form: FormData,
): Promise<BackupCodesResult> {
  return viewBackupCodes(backupCodesDeps(), payload(form));
}

export async function regenerateBackupCodesAction(
  _prev: unknown,
  form: FormData,
): Promise<BackupCodesResult> {
  return regenerateBackupCodes(backupCodesDeps(), payload(form));
}
