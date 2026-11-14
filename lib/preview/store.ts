/** Preview grants and sessions in Postgres (D013; lib/preview/access.ts). */
import { and, eq, gt, isNull } from "drizzle-orm";
import { authUser, previewGrants, previewSessions } from "../db/schema";
import type { Db } from "../db/store";
import type { PreviewAccessStore } from "./access";

export function drizzlePreviewStore(database: Db): PreviewAccessStore {
  return {
    async createGrant(g) {
      await database.insert(previewGrants).values(g);
    },

    async redeemGrant(tokenHash, host, now) {
      // One statement: a grant replayed in parallel cannot be redeemed twice.
      const rows = await database
        .update(previewGrants)
        .set({ usedAt: now })
        .where(
          and(
            eq(previewGrants.tokenHash, tokenHash),
            eq(previewGrants.host, host),
            isNull(previewGrants.usedAt),
            gt(previewGrants.expiresAt, now),
          ),
        )
        .returning({ userId: previewGrants.userId, path: previewGrants.path });
      return rows[0] ?? null;
    },

    async createSession(s) {
      await database.insert(previewSessions).values(s);
    },

    async findSession(tokenHash, now) {
      const rows = await database
        .select({
          userId: previewSessions.userId,
          expiresAt: previewSessions.expiresAt,
        })
        .from(previewSessions)
        .innerJoin(authUser, eq(authUser.id, previewSessions.userId))
        .where(
          and(
            eq(previewSessions.tokenHash, tokenHash),
            gt(previewSessions.expiresAt, now),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
  };
}
