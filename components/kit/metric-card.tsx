import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

/** HANDOFF §2 · MetricCard: label, value + unit, sparkline. A 5xx value above 0 is destructive. */
export function MetricCard({
  label,
  value,
  unit,
  series,
  seriesLabel,
  alert = false,
}: {
  label: string;
  value: string;
  unit?: string;
  series: number[];
  seriesLabel: string;
  /** True for a 5xx count above zero: the value and the line turn destructive. */
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
      <p className="text-eyebrow text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span
          className={cn(
            "font-medium font-mono text-metric",
            alert && "text-destructive",
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-mono text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </p>
      <Sparkline
        data={series}
        label={seriesLabel}
        tone={alert ? "destructive" : "primary"}
      />
    </div>
  );
}
