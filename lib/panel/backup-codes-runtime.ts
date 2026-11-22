/**
 * The real dependencies of Ver códigos / Generar nuevos (lib/panel/actions/backup-codes.ts,
 * D067). Server only. Better Auth is called server-side (`auth.api`), so no new route goes
 * through lib/auth/handler.ts: `viewBackupCodes` is server-only by design, and
 * `generateBackupCodes` runs with the request's session (no password: `allowPasswordless`).
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { clientIp } from "@/lib/auth/handler";
import { betterAuthTotp } from "@/lib/auth/totp-check";
import { drizzleAuditStore } from "@/lib/db/audit";
import { db } from "@/lib/db/store";
import type {
  BackupCodesDeps,
  BackupCodesSource,
} from "./actions/backup-codes";
import { drizzlePanelStore } from "./data/store";
import { sessionUser } from "./session";
import { panelTotpGuard } from "./totp-guard";

/** A Better Auth APIError's HTTP status, without `instanceof` (two copies of the class exist). */
function statusOf(e: unknown): number | null {
  if (typeof e !== "object" || e === null) return null;
  const s = (e as { statusCode?: unknown }).statusCode;
  return typeof s === "number" ? s : null;
}

/** What it needs from Better Auth's two-factor plugin. */
export type BackupCodesApi = {
  api: {
    viewBackupCodes(args: {
      body: { userId: string };
    }): Promise<{ backupCodes: string[] }>;
    generateBackupCodes(args: {
      body: Record<string, never>;
      headers: Headers;
    }): Promise<{ backupCodes: string[] }>;
  };
};

/**
 * 400 is Better Auth's "no second factor" (`BACKUP_CODES_NOT_ENABLED`, `TWO_FACTOR_NOT_ENABLED`)
 * → null; anything else (codes it cannot decrypt, a database error) is thrown on.
 */
export function betterAuthBackupCodes(
  source: () => BackupCodesApi,
  requestHeaders: () => Promise<Headers>,
): BackupCodesSource {
  const orNull = async (call: () => Promise<{ backupCodes: string[] }>) => {
    try {
      const res = await call();
      return Array.isArray(res.backupCodes) ? res.backupCodes : [];
    } catch (e) {
      if (statusOf(e) === 400) return null;
      throw e;
    }
  };
  return {
    view: (userId) =>
      orNull(() => source().api.viewBackupCodes({ body: { userId } })),
    regenerate: async () => {
      const h = await requestHeaders();
      return orNull(() =>
        source().api.generateBackupCodes({ body: {}, headers: h }),
      );
    },
  };
}

export function backupCodesDeps(): BackupCodesDeps {
  const database = db();
  const store = drizzlePanelStore(database);
  return {
    user: sessionUser,
    codes: betterAuthBackupCodes(auth, headers),
    audit: drizzleAuditStore(database),
    totpEnabled: (userId) => store.twoFactorEnabled(userId),
    verifyTotp: betterAuthTotp(auth, headers),
    guard: panelTotpGuard,
    clientIp: async () => clientIp(await headers()),
    log: (line) => console.warn(line),
    revalidate: (path) => revalidatePath(path),
  };
}
