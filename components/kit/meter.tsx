import { type MeterLevel, meterLevel, meterPercent } from "@/lib/kit/meter";
import { cn } from "@/lib/utils";

const FILL: Record<MeterLevel, string> = {
  normal: "bg-primary",
  warning: "bg-warning",
  critical: "bg-destructive",
};

function Bar({
  value,
  max,
  label,
  valueText,
  level,
  className,
}: {
  value: number;
  max: number;
  label: string;
  valueText: string;
  level: MeterLevel;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: <meter> cannot be styled to the 6px bar of the design
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={valueText}
      className={cn("h-1.5 overflow-hidden rounded-full bg-raised", className)}
    >
      <div
        className={cn("h-full rounded-full", FILL[level])}
        style={{ width: `${meterPercent(value, max)}%` }}
      />
    </div>
  );
}

/**
 * HANDOFF §2 · Meter. `card`: label, value "de X", bar and note. `row`: 80×6 bar + value for a
 * table cell. ≥ 85 % the fill is warning; ≥ 95 % destructive and the words "casi lleno".
 */
export function Meter({
  variant = "card",
  label,
  value,
  max,
  valueText,
  maxText,
  note,
  className,
}: {
  variant?: "card" | "row";
  label: string;
  value: number;
  max: number;
  /** The value as the page shows it, e.g. "3,1 GB". */
  valueText: string;
  /** e.g. "de 8 GB". */
  maxText?: string;
  note?: string;
  className?: string;
}) {
  const level = meterLevel(value, max);
  const spoken = maxText ? `${valueText} ${maxText}` : valueText;
  const almostFull = level === "critical";

  if (variant === "row") {
    return (
      <div className={cn("inline-flex items-center gap-3", className)}>
        <Bar
          value={value}
          max={max}
          label={label}
          valueText={spoken}
          level={level}
          className="w-20"
        />
        <span className="font-mono text-mono">{valueText}</span>
        {almostFull ? (
          <span className="text-caption text-destructive">casi lleno</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <p className="text-eyebrow text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium font-mono text-metric">{valueText}</span>
        {maxText ? (
          <span className="font-mono text-mono text-muted-foreground">
            {maxText}
          </span>
        ) : null}
      </p>
      <Bar
        value={value}
        max={max}
        label={label}
        valueText={spoken}
        level={level}
      />
      {almostFull || note ? (
        <p
          className={cn(
            "text-caption",
            almostFull ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {almostFull ? "casi lleno" : null}
          {almostFull && note ? " · " : null}
          {note}
        </p>
      ) : null}
    </div>
  );
}
