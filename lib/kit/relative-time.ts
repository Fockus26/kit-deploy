/** Relative time in Spanish ("hace 14 min", "ayer", "hace 3 días"), pure so it can be tested with a fixed clock. */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** From here on a relative phrase stops being useful: show the date. */
const RELATIVE_DAYS_LIMIT = 30;

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/** Calendar days from `now` to `date` (positive = past), by local midnight. */
function calendarDaysAgo(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY);
}

export function formatAbsolute(date: Date): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export function formatRelative(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);

  if (abs < 45 * SECOND)
    return future ? "en unos segundos" : "hace unos segundos";
  if (abs < HOUR) {
    const minutes = Math.max(1, Math.round(abs / MINUTE));
    return future ? `en ${minutes} min` : `hace ${minutes} min`;
  }
  const days = calendarDaysAgo(date, now);
  if (abs < DAY && Math.abs(days) < 1) {
    const hours = Math.round(abs / HOUR);
    return future ? `en ${hours} h` : `hace ${hours} h`;
  }
  if (days === 1) return "ayer";
  if (days === -1) return "mañana";
  if (Math.abs(days) <= RELATIVE_DAYS_LIMIT) {
    const n = Math.abs(days) < 2 ? 1 : Math.abs(days);
    return future ? `en ${n} días` : `hace ${n} días`;
  }
  return new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(date);
}
