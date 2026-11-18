import type * as React from "react";
import { cn } from "@/lib/utils";

// A native <select> on the Input's tokens: the browser's own list is the most accessible one
// (keyboard, touch, screen readers), and a filter bar of four needs nothing more.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "flex min-h-control w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-input-touch text-foreground outline-none transition-colors duration-120 ease-default md:text-body",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:text-disabled",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
