/**
 * Five-field cron schedules (minute hour day-of-month month day-of-week), in UTC like Vercel Cron
 * (brief F12). Supports `*`, numbers, `a-b` ranges, lists and `/step`; day-of-week 0–7 (0 and 7
 * are Sunday). As in Vixie cron, when both day fields are restricted a day matches either one.
 * No names (`MON`, `JAN`) and no `@daily` macros: one spelling, the one every doc shows.
 */

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day of week", min: 0, max: 7 },
] as const;

export type Schedule = {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domAny: boolean;
  dowAny: boolean;
};

const NUM = /^\d{1,2}$/;

function field(text: string, i: number): { set: Set<number>; any: boolean } {
  const f = FIELDS[i];
  if (!f) throw new ScheduleError("too many fields");
  const set = new Set<number>();
  for (const part of text.split(",")) {
    const [range, stepText, extra] = part.split("/");
    if (extra !== undefined || range === undefined || range === "")
      throw new ScheduleError(`bad ${f.name} "${text}"`);
    let step = 1;
    if (stepText !== undefined) {
      if (!NUM.test(stepText) || Number(stepText) < 1)
        throw new ScheduleError(`bad step in ${f.name} "${text}"`);
      step = Number(stepText);
    }
    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = f.min;
      hi = f.max;
    } else {
      const [a, b, more] = range.split("-");
      if (
        more !== undefined ||
        !a ||
        !NUM.test(a) ||
        (b !== undefined && !NUM.test(b))
      )
        throw new ScheduleError(`bad ${f.name} "${text}"`);
      lo = Number(a);
      hi = b === undefined ? (stepText === undefined ? lo : f.max) : Number(b);
    }
    if (lo < f.min || hi > f.max || lo > hi)
      throw new ScheduleError(
        `${f.name} out of range (${f.min}-${f.max}) in "${text}"`,
      );
    for (let v = lo; v <= hi; v += step) set.add(i === 4 && v === 7 ? 0 : v);
  }
  return { set, any: text === "*" };
}

export function parseSchedule(text: string): Schedule {
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 5)
    throw new ScheduleError(
      `a schedule has 5 fields (minute hour day month weekday), got ${parts.length}`,
    );
  const [mi, h, dom, mo, dow] = parts.map((p, i) => field(p, i));
  if (!mi || !h || !dom || !mo || !dow) throw new ScheduleError("bad schedule");
  return {
    minute: mi.set,
    hour: h.set,
    dom: dom.set,
    month: mo.set,
    dow: dow.set,
    domAny: dom.any,
    dowAny: dow.any,
  };
}

/** Whether the schedule fires in the UTC minute that contains `at`. */
export function matches(s: Schedule, at: Date): boolean {
  if (!s.minute.has(at.getUTCMinutes()) || !s.hour.has(at.getUTCHours()))
    return false;
  if (!s.month.has(at.getUTCMonth() + 1)) return false;
  const domOk = s.dom.has(at.getUTCDate());
  const dowOk = s.dow.has(at.getUTCDay());
  if (s.domAny && s.dowAny) return true;
  if (s.domAny) return dowOk;
  if (s.dowAny) return domOk;
  return domOk || dowOk;
}

/** The next minute (after `from`) the schedule fires, within a year; null if never. */
export function nextRun(s: Schedule, from: Date): Date | null {
  const t = new Date(from.getTime());
  t.setUTCSeconds(0, 0);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    t.setUTCMinutes(t.getUTCMinutes() + 1);
    if (matches(s, t)) return new Date(t.getTime());
  }
  return null;
}

/** A route path the agent will call: absolute, no query or fragment, no `..`. Same alphabet as
 * the agent's health.check path. */
export const CRON_PATH_RE = /^\/(?!.*\.\.)[A-Za-z0-9._~/-]{0,200}$/;
