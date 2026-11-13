/** The enrolment links in Postgres (`enrolment_tokens`). */
import { and, eq, gt, isNull } from "drizzle-orm";
import { enrolmentTokens } from "../db/schema";
import type { Db } from "../db/store";
import type { EnrolmentStore } from "./enrolment";

export function drizzleEnrolmentStore(database: Db): EnrolmentStore {
  return {
    async redeem(tokenHash, now) {
      // One statement: two concurrent redeems of the same link cannot both win.
      const rows = await database
        .update(enrolmentTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(enrolmentTokens.tokenHash, tokenHash),
            isNull(enrolmentTokens.usedAt),
            gt(enrolmentTokens.expiresAt, now),
          ),
        )
        .returning({ userId: enrolmentTokens.userId });
      return rows[0]?.userId ?? null;
    },
  };
}
