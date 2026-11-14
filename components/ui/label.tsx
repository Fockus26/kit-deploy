import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Label, as a native <label> (no Radix needed for a plain form).
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor
    <label
      data-slot="label"
      className={cn("font-medium text-body text-foreground", className)}
      {...props}
    />
  );
}

export { Label };
