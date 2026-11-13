/**
 * The dashboard's account and its enrolment links, from the CLI on the VPS (D003: no sign-up,
 * the first account is seeded by `kit-deploy user create`). Behind an interface so the commands
 * are tested without Postgres.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { AdminError } from "./admin";
import { authUser, enrolmentTokens } from "./schema";
import type { Db } from "./store";

export interface UserStore {
  /** The account and its first enrolment link, in one transaction. v1 has one account (D003):
   * refused if any account exists. */
  createUser(
    email: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<{ id: string }>;
  /** A new link for an existing account; its earlier unused links stop working. */
  issueEnrolment(
    email: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<{ id: string }>;
}

export function drizzleUserStore(db: Db): UserStore {
  return {
    async createUser(email, tokenHash, expiresAt) {
      return db.transaction(async (tx) => {
        // Serializes two concurrent `user create`: the second sees the first's account.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('kit-deploy:user-create'))`,
        );
        const [existing] = await tx
          .select({ id: authUser.id })
          .from(authUser)
          .limit(1);
        if (existing) {
          throw new AdminError(
            "an account already exists (one account in v1, D003): use `kit-deploy user enrol <email>`",
          );
        }
        const id = randomUUID();
        await tx
          .insert(authUser)
          .values({ id, email, name: email, emailVerified: true });
        await tx
          .insert(enrolmentTokens)
          .values({ userId: id, tokenHash, expiresAt });
        return { id };
      });
    },

    async issueEnrolment(email, tokenHash, expiresAt) {
      return db.transaction(async (tx) => {
        const [user] = await tx
          .select({ id: authUser.id })
          .from(authUser)
          .where(eq(authUser.email, email));
        if (!user) throw new AdminError(`no account ${email}`);
        await tx
          .update(enrolmentTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(enrolmentTokens.userId, user.id),
              isNull(enrolmentTokens.usedAt),
            ),
          );
        await tx
          .insert(enrolmentTokens)
          .values({ userId: user.id, tokenHash, expiresAt });
        return user;
      });
    },
  };
}
