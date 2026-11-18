"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui RadioGroup (radix-ui), 18×18 on the `input` border token (HANDOFF §2 · Field).
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "flex size-4.5 shrink-0 items-center justify-center rounded-full border border-input bg-card outline-none transition-colors duration-120 ease-default",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "data-[state=checked]:border-primary aria-invalid:border-destructive disabled:cursor-not-allowed disabled:border-border",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-primary" />
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
