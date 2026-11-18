import type { AlertRow, AlertStore, Streak } from "../../lib/alerts/engine";
import type { AlertsReader } from "../../lib/alerts/store";

/** `alerts` and `alert_checks` in memory, with the same rules as lib/alerts/store.ts. */
export function memoryAlertStore() {
  const rows: AlertRow[] = [];
  let streaks = new Map<string, Streak & { at: Date }>();
  let n = 0;
  const store: AlertStore = {
    async streaks() {
      return new Map(
        [...streaks].map(([k, s]) => [
          k,
          { failing: s.failing, streak: s.streak },
        ]),
      );
    },
    async saveStreaks(next, now) {
      for (const [k, s] of next) streaks.set(k, { ...s, at: now });
    },
    async pruneStreaks(before) {
      streaks = new Map([...streaks].filter(([, s]) => s.at >= before));
    },
    async openAlerts() {
      return rows.filter((r) => !r.resolvedAt);
    },
    async open(o, now) {
      if (rows.some((r) => r.key === o.key && !r.resolvedAt)) return;
      rows.push({
        id: String(++n),
        key: o.key,
        kind: o.kind,
        project: o.project,
        title: o.title,
        detail: o.detail,
        openedAt: now,
        lastSeenAt: now,
        resolvedAt: null,
        notifiedAt: null,
        resolvedNotifiedAt: null,
      });
    },
    async touch(id, o, now) {
      const r = rows.find((x) => x.id === id);
      if (r)
        Object.assign(r, { lastSeenAt: now, title: o.title, detail: o.detail });
    },
    async resolve(id, now, detail) {
      const r = rows.find((x) => x.id === id && !x.resolvedAt);
      if (r)
        Object.assign(r, { resolvedAt: now, ...(detail ? { detail } : {}) });
    },
    async pending(limit) {
      return rows
        .filter((r) => !r.notifiedAt || (r.resolvedAt && !r.resolvedNotifiedAt))
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async markNotified(list, now) {
      for (const p of list) {
        const r = rows.find((x) => x.id === p.id);
        if (!r) continue;
        r.notifiedAt ??= now;
        if (p.resolvedAt) r.resolvedNotifiedAt = now;
      }
    },
  };
  const reader: AlertsReader = {
    open: async () => rows.filter((r) => !r.resolvedAt),
    recent: async (limit) => [...rows].reverse().slice(0, limit),
  };
  return { store, reader, rows, streaks: () => streaks };
}
