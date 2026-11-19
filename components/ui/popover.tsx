"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Popover (new-york, radix-ui), on kit-deploy's tokens: the same popup box as
// SelectContent (card, border, shadow-md, menu animation).

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-40 animate-menu-in data-[state=closed]:animate-menu-out rounded-md border border-border bg-card p-1 text-card-foreground shadow-md outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
