import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Alert (new-york), on kit-deploy's tokens. The state is never color alone: callers
// put an icon and a word in the title (DESIGN_RULES › Every state = icon + word).
const alertVariants = cva(
  "grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-body [&>svg]:mt-0.5 [&>svg]:size-4",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive:
          "border-destructive bg-destructive-surface text-foreground [&>svg]:text-destructive",
        success:
          "border-success bg-success-surface text-foreground [&>svg]:text-success",
        warning:
          "border-warning bg-warning-surface text-foreground [&>svg]:text-warning",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-title"
      className={cn("col-start-2 font-medium", className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 text-foreground", className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
