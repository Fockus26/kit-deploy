import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Textarea, same skin as Input (16px on touch screens so iOS does not zoom).
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-input-touch text-foreground outline-none transition-colors duration-120 ease-default placeholder:text-muted-foreground md:text-body",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:text-disabled",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
