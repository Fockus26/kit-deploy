import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** HANDOFF §2 · EmptyState. `action` is a real link or button (buttonVariants / Button). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  level = 2,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  /** Heading level of the title: one below the heading of the section it sits in. */
  level?: 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${level}` as const;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.5}
        className="size-8 text-muted-foreground"
      />
      <Heading className="font-semibold text-h2">{title}</Heading>
      {children ? (
        <p className="max-w-xs text-body text-muted-foreground">{children}</p>
      ) : null}
      {action}
    </div>
  );
}
