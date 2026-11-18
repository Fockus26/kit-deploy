"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

/** 100 % × 40 px, a 2px line, no axes or dots (HANDOFF §2). 5xx series use `destructive`. */
export function Sparkline({
  data,
  label,
  tone = "primary",
}: {
  data: number[];
  /** What the series says in words ("Tres errores 5xx aislados"): it is the accessible name. */
  label: string;
  tone?: "primary" | "destructive";
}) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div role="img" aria-label={label} className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={points}
          accessibilityLayer={false}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
        >
          <YAxis hide domain={[0, "dataMax"]} />
          <Line
            type="monotone"
            dataKey="v"
            stroke={
              tone === "destructive" ? "var(--destructive)" : "var(--primary)"
            }
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
