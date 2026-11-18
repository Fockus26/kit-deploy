import { cn } from "@/lib/utils";

const DOT = {
  success: "bg-success",
  info: "bg-info",
  neutral: "bg-muted-foreground",
  destructive: "bg-destructive",
  warning: "bg-warning",
} as const;

/** Decorative: only in the sidebar next to a name; the page says the state in words (HANDOFF §2). */
export function StatusDot({
  tone = "neutral",
  className,
}: {
  tone?: keyof typeof DOT;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        DOT[tone],
        className,
      )}
    />
  );
}
