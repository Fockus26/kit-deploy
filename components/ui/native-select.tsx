import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui NativeSelect (new-york), on kit-deploy's tokens: the browser's own <select>, so the
// keyboard, screen readers and phones get their native picker. Same box as Input.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full min-w-0">
      <select
        data-slot="native-select"
        className={cn(
          "flex min-h-control w-full min-w-0 appearance-none rounded-md border border-input bg-card py-2 pr-9 pl-3 text-input-touch text-foreground outline-none transition-colors duration-120 ease-default md:text-body",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:text-disabled",
          className,
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };
