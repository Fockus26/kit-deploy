/**
 * Ajustes › Passkeys › Eliminar (D055): one passkey of one user, and its audit row in the same
 * transaction. Behind an interface so the panel action is tested without Postgres.
 */
import { and, eq } from "drizzle-orm";
import { ACCOUNT_AUDIT_PROJECT } from "./account-scope";
import { writeAudit } from "./audit";
import { authPasskey } from "./schema";
import type { Db } from "./store";

export type RemovedPasskey = { id: string; name: string | null };

export interface PasskeyStore {
  /** Deletes the passkey only if it is `userId`'s (both in the WHERE). Null when there was none
   * — already removed, or another user's: the caller cannot tell them apart, on purpose. The
   * audit row (`passkey.remove`, the passkey's name or id, never key material) is written only
   * when this call deleted it. */
  remove(
    userId: string,
    id: string,
    actor: string,
  ): Promise<RemovedPasskey | null>;
}

export function drizzlePasskeyStore(db: Db): PasskeyStore {
  return {
    remove: (userId, id, actor) =>
      db.transaction(async (tx) => {
        const [row] = await tx
          .delete(authPasskey)
          .where(and(eq(authPasskey.id, id), eq(authPasskey.userId, userId)))
          .returning({ id: authPasskey.id, name: authPasskey.name });
        if (!row) return null;
        await writeAudit(tx, {
          actor,
          action: "passkey.remove",
          project: ACCOUNT_AUDIT_PROJECT,
          name: row.name ?? row.id,
        });
        return row;
      }),
  };
}
