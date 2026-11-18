import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** HANDOFF §2 · EmptyState. `action` is a real link or button (buttonVariants / Button). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
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
      <h2 className="font-semibold text-h2">{title}</h2>
      {children ? (
        <p className="max-w-xs text-body text-muted-foreground">{children}</p>
      ) : null}
      {action}
    </div>
  );
}
