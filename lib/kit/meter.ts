/** Thresholds of the Meter (HANDOFF §2): ≥ 85 % warning, ≥ 95 % destructive + "casi lleno". */
export const METER_WARNING = 85;
export const METER_CRITICAL = 95;

export type MeterLevel = "normal" | "warning" | "critical";

export function meterPercent(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function meterLevel(value: number, max: number): MeterLevel {
  const pct = meterPercent(value, max);
  if (pct >= METER_CRITICAL) return "critical";
  if (pct >= METER_WARNING) return "warning";
  return "normal";
}
