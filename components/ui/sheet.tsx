"use client";

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Sheet (new-york, radix-ui), on kit-deploy's tokens. Left: the mobile navigation,
// 280px; right: a deployment's detail, 480px at most (HANDOFF §3). It enters from its side and leaves
// the same way (HANDOFF §6).

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>,
) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetContent({
  className,
  children,
  closeLabel = "Cerrar",
  side = "left",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  closeLabel?: string;
  side?: "left" | "right";
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 animate-fade-in bg-overlay data-[state=closed]:animate-fade-out"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 z-50 flex h-full flex-col bg-nav shadow-lg outline-none",
          side === "left"
            ? "left-0 w-sheet animate-sheet-in border-border border-r data-[state=closed]:animate-sheet-out"
            : "right-0 w-full max-w-sheet-detail animate-sheet-in-right border-border border-l data-[state=closed]:animate-sheet-out-right",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="absolute top-2 right-2 inline-flex size-control items-center justify-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          aria-label={closeLabel}
        >
          <XIcon aria-hidden="true" className="size-4" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground text-h2", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-caption text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
};
