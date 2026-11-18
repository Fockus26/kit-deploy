"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { shouldAutoPause } from "@/lib/kit/log-follow";
import { cn } from "@/lib/utils";

export type LogLevel = "info" | "warn" | "error";
export type LogLine = {
  /** Already formatted, e.g. "14:02:11". */
  time: string;
  level: LogLevel;
  text: string;
};

const LEVEL: Record<LogLevel, string> = {
  error: "text-destructive",
  warn: "text-warning",
  info: "text-muted-foreground",
};

/**
 * HANDOFF §2 · LogViewer. Presentational: the caller owns `following` and flips it in
 * `onTogglePause`. While following, new lines jump to the end (no animation: it also is the
 * reduced-motion behaviour); scrolling up calls `onTogglePause` once, so it pauses by itself.
 */
export function LogViewer({
  lines,
  following,
  onTogglePause,
  label,
  className,
}: {
  lines: LogLine[];
  following: boolean;
  onTogglePause: () => void;
  /** Accessible name of the log, e.g. "Logs de maranatha (producción)". */
  label: string;
  /** Height of the scroll box, e.g. "max-h-96". */
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new lines / resume
  useEffect(() => {
    const el = box.current;
    if (following && el) el.scrollTop = el.scrollHeight;
  }, [lines, following]);

  return (
    <div className="rounded-lg border border-border bg-nav">
      <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-4 py-2">
        <p className="flex items-center gap-2 text-caption">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              following
                ? "bg-success motion-safe:animate-pulse"
                : "bg-muted-foreground",
            )}
          />
          {following ? "Siguiendo" : "En pausa"}
        </p>
        <Button variant="outline" size="sm" onClick={onTogglePause}>
          {following ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {following ? "Pausar" : "Reanudar"}
        </Button>
      </div>
      {/* role=log is a live region; a scrollable region must be focusable for the keyboard. */}
      <div
        ref={box}
        role="log"
        aria-label={label}
        aria-live={following ? "polite" : "off"}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must take focus
        tabIndex={0}
        onScroll={(e) => {
          if (shouldAutoPause(following, e.currentTarget)) onTogglePause();
        }}
        className={cn(
          "overflow-auto px-4 py-3 font-mono text-mono leading-[1.7] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          className ?? "max-h-96",
        )}
      >
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
          <div key={i} className="flex gap-3 whitespace-pre">
            <span className="shrink-0 text-muted-foreground">{line.time}</span>
            <span className={cn("w-10 shrink-0", LEVEL[line.level])}>
              {line.level}
            </span>
            <span>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
