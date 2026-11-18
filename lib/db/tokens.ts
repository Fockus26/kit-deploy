/**
 * Deploy tokens as Ajustes lists and revokes them. Only the hash is stored (lib/tokens.ts); this
 * store never reads or returns it. Behind an interface so the panel is tested without Postgres.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { deployTokens, projects } from "./schema";
import type { Db } from "./store";

export type TokenRow = {
  id: string;
  project: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export interface TokenStore {
  /** Every token, newest first, revoked ones included (Ajustes shows when). */
  list(): Promise<TokenRow[]>;
  /** The token's project, or null for no such token. */
  find(id: string): Promise<TokenRow | null>;
  /** False when it was already revoked (or never existed). */
  revoke(id: string, now?: Date): Promise<boolean>;
}

export function drizzleTokenStore(db: Db): TokenStore {
  const select = () =>
    db
      .select({
        id: deployTokens.id,
        project: projects.name,
        label: deployTokens.label,
        createdAt: deployTokens.createdAt,
        lastUsedAt: deployTokens.lastUsedAt,
        revokedAt: deployTokens.revokedAt,
      })
      .from(deployTokens)
      .innerJoin(projects, eq(projects.id, deployTokens.projectId));

  return {
    async list() {
      return select().orderBy(desc(deployTokens.createdAt));
    },

    async find(id) {
      const [row] = await select().where(eq(deployTokens.id, id)).limit(1);
      return row ?? null;
    },

    async revoke(id, now = new Date()) {
      const rows = await db
        .update(deployTokens)
        .set({ revokedAt: now })
        .where(and(eq(deployTokens.id, id), isNull(deployTokens.revokedAt)))
        .returning({ id: deployTokens.id });
      return rows.length > 0;
    },
  };
}
