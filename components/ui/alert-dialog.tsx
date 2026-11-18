"use client";

import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui AlertDialog (new-york, radix-ui), on kit-deploy's tokens (HANDOFF §2 · ConfirmDialog):
// max 420 wide, padding 24, radius 8, shadow-lg, overlay token. Opacity + scale on enter; with
// reduced motion the global rule zeroes the duration.

function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>,
) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>,
) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-50 animate-fade-in bg-overlay data-[state=closed]:animate-fade-out"
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-105 -translate-x-1/2 -translate-y-1/2 animate-dialog-in flex-col data-[state=closed]:animate-dialog-out gap-3 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "font-semibold text-h2 [overflow-wrap:anywhere]",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-body text-muted-foreground [overflow-wrap:anywhere]",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("mt-1 flex flex-wrap justify-end gap-2", className)}
      {...props}
    />
  );
}

function AlertDialogAction(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Action>,
) {
  return (
    <AlertDialogPrimitive.Action data-slot="alert-dialog-action" {...props} />
  );
}

function AlertDialogCancel(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>,
) {
  return (
    <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" {...props} />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
};
