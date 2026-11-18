/**
 * Where "Rollback" goes without a target: the same pick as the server's (lib/deploy/switch.ts) —
 * the newest kept production deployment older than the live one — so the dialog can name both
 * SHAs before anything happens. Pure; `items` come newest first (lib/panel/data).
 */
export type RollbackCandidate = {
  id: string;
  shortSha: string;
  environment: "production" | "preview";
  status: string;
  rollbackable: boolean;
  createdAt: Date;
};

export function rollbackTarget(
  items: readonly RollbackCandidate[],
): { id: string; sha: string } | null {
  const production = items.filter((d) => d.environment === "production");
  const live = production.find((d) => d.status === "live");
  const target = production.find(
    (d) => d.rollbackable && (!live || d.createdAt < live.createdAt),
  );
  return target ? { id: target.id, sha: target.shortSha } : null;
}
