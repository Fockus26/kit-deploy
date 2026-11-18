import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Skeleton, on kit-deploy's tokens. Decorative: the region that waits says so in text.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "motion-safe:animate-pulse rounded-md bg-raised",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
