/**
 * Ajustes › Auditoría's rows (brief F4, D045): who did what to which project, never a value. A
 * change that is only a database write records its row in the same transaction (`writeAudit`);
 * one done by kit-agent (stop, restart) or the switch (redeploy, rollback) records it once it
 * succeeded (`AuditStore.record`).
 */
import type { Environment } from "../core/env";
import { type AuditAction, auditLog } from "./schema";
import type { Db } from "./store";

export type AuditEntry = {
  /** `web:<user id>` or `ssh:<user>` (lib/db/env-store.ts `webActor`, `sshActor`). */
  actor: string;
  action: AuditAction;
  project: string;
  environment?: Environment | null;
  /** A name only — a variable, a host, a token's label, a deployment — never a value. */
  name?: string | null;
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Inside the caller's transaction, so the change and its row commit together. */
export async function writeAudit(tx: Db | Tx, e: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actor: e.actor,
    action: e.action,
    project: e.project,
    environment: e.environment ?? null,
    name: e.name ?? null,
  });
}

export interface AuditStore {
  record(e: AuditEntry): Promise<void>;
}

export function drizzleAuditStore(db: Db): AuditStore {
  return { record: (e) => writeAudit(db, e) };
}
