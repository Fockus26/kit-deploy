import { cva } from "class-variance-authority";
import { AlertTriangle, Info, type LucideIcon, XCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

type NoticeTone = "info" | "warning" | "destructive";

const ICON: Record<NoticeTone, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  destructive: XCircle,
};

const notice = cva(
  "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border px-4 py-3 text-body",
  {
    variants: {
      tone: {
        info: "border-info bg-info-surface [&_[data-notice-icon]]:text-info",
        warning:
          "border-warning bg-warning-surface [&_[data-notice-icon]]:text-warning",
        destructive:
          "border-destructive bg-destructive-surface [&_[data-notice-icon]]:text-destructive",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

/**
 * HANDOFF §2 · Notice. `role="status"` for notices after saving; `role="alert"` only for errors
 * (the destructive tone). The state is the icon plus the title's words.
 */
export function Notice({
  tone = "info",
  title,
  children,
  actions,
  className,
}: {
  tone?: NoticeTone;
  title: string;
  children?: React.ReactNode;
  /** Buttons or links, on the right (wrapping under the text when narrow). */
  actions?: React.ReactNode;
  className?: string;
}) {
  const Icon = ICON[tone];
  return (
    <div
      role={tone === "destructive" ? "alert" : "status"}
      className={cn(notice({ tone }), className)}
    >
      <Icon
        data-notice-icon=""
        aria-hidden="true"
        className="mt-0.5 size-[18px] shrink-0"
      />
      <div className="min-w-48 flex-1 [overflow-wrap:anywhere]">
        <p className="font-medium text-foreground">{title}</p>
        {children ? (
          <div className="mt-1 text-foreground">{children}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
