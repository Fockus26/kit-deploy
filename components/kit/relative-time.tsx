"use client";

import { useEffect, useState } from "react";
import { formatAbsolute, formatRelative } from "@/lib/kit/relative-time";

/** Refresh cadence (HANDOFF §2). */
const REFRESH_MS = 60_000;

/** `<time>` with a relative phrase; `title` carries the absolute local date. */
export function RelativeTime({
  date,
  now,
  className,
}: {
  date: Date | string | number;
  /** Fixed clock for tests and screenshots; otherwise the real one, refreshed every minute. */
  now?: Date;
  className?: string;
}) {
  const d = new Date(date);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (now) return;
    const id = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, [now]);

  // Server and browser clocks and time zones differ: the text settles on the client.
  return (
    <time
      dateTime={d.toISOString()}
      title={formatAbsolute(d)}
      className={className}
      suppressHydrationWarning
    >
      {formatRelative(d, now ?? new Date())}
    </time>
  );
}
