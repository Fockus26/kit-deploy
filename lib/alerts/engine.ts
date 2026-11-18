/**
 * The incidents' life (D047): each run's observations move the streaks, open and resolve rows in
 * `alerts`, then every transition not emailed yet goes out in ONE digest — one email per run at
 * most, whatever broke at once (no storm). A failed send leaves the rows un-notified, and the next
 * run sends them again. Behind `AlertStore` so it is tested without Postgres.
 */
import type { AlertKind } from "../db/schema";
import { DIGEST_MAX, type Observation, RULES, STREAK_TTL_MS } from "./rules";

export type AlertRow = {
  id: string;
  key: string;
  kind: AlertKind;
  project: string | null;
  title: string;
  detail: string;
  openedAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  notifiedAt: Date | null;
  resolvedNotifiedAt: Date | null;
};

export type Streak = { failing: boolean; streak: number };

export interface AlertStore {
  streaks(): Promise<Map<string, Streak>>;
  saveStreaks(rows: Map<string, Streak>, now: Date): Promise<void>;
  /** Streak rows not updated since `before`. */
  pruneStreaks(before: Date): Promise<void>;
  openAlerts(): Promise<AlertRow[]>;
  open(o: Observation, now: Date): Promise<void>;
  /** Still failing: last_seen_at, and the newest title/detail (a cert's days left). */
  touch(id: string, o: Observation, now: Date): Promise<void>;
  resolve(id: string, now: Date, detail?: string): Promise<void>;
  /** Rows with an email owed (opened and not notified, or resolved and not notified), oldest
   * first, at most `limit`. */
  pending(limit: number): Promise<AlertRow[]>;
  /** The digest went out: these rows' owed emails are paid. */
  markNotified(rows: AlertRow[], now: Date): Promise<void>;
}

export type Transitions = { opened: string[]; resolved: string[] };

/**
 * `covered`: the kinds whose check ran to the end this time. An open alert of a covered kind
 * whose subject was not observed (project removed, container stopped on purpose) is resolved;
 * one of a kind whose check could not run (agent down) is left as it is.
 */
export async function evaluate(
  store: AlertStore,
  observations: Observation[],
  covered: ReadonlySet<AlertKind>,
  now: Date,
): Promise<Transitions> {
  const before = await store.streaks();
  const open = new Map((await store.openAlerts()).map((a) => [a.key, a]));
  const next = new Map<string, Streak>();
  const out: Transitions = { opened: [], resolved: [] };

  for (const o of observations) {
    if (next.has(o.key)) continue; // one observation per subject and run
    const prev = before.get(o.key);
    const streak = prev && prev.failing === o.failing ? prev.streak + 1 : 1;
    next.set(o.key, { failing: o.failing, streak });
    const rule = RULES[o.kind];
    const current = open.get(o.key);
    if (o.failing) {
      if (current) await store.touch(current.id, o, now);
      else if (streak >= rule.openAfter) {
        await store.open(o, now);
        out.opened.push(o.key);
      }
    } else if (current && streak >= rule.resolveAfter) {
      await store.resolve(current.id, now, o.detail || undefined);
      out.resolved.push(o.key);
    }
  }

  for (const [key, a] of open) {
    if (next.has(key) || !covered.has(a.kind)) continue;
    await store.resolve(
      a.id,
      now,
      "Ya no se comprueba (el sujeto ya no existe o se detuvo a propósito).",
    );
    out.resolved.push(key);
  }

  await store.saveStreaks(next, now);
  await store.pruneStreaks(new Date(now.getTime() - STREAK_TTL_MS));
  return out;
}

export type Digest = { subject: string; html: string; text: string };

export interface Mailer {
  send(d: Digest): Promise<void>;
}

export type NotifyResult =
  | { sent: number }
  | { sent: 0; waiting: number; reason: string };

/** The owed emails, in one digest. Without a mailer they wait (and are counted). */
export async function notify(
  store: AlertStore,
  mailer: Mailer | null,
  render: (rows: AlertRow[], now: Date) => Digest,
  now: Date,
): Promise<NotifyResult> {
  const rows = await store.pending(DIGEST_MAX);
  if (rows.length === 0) return { sent: 0 };
  if (!mailer)
    return { sent: 0, waiting: rows.length, reason: "no mailer configured" };
  try {
    await mailer.send(render(rows, now));
  } catch (e) {
    return { sent: 0, waiting: rows.length, reason: (e as Error).message };
  }
  await store.markNotified(rows, now);
  return { sent: rows.length };
}
