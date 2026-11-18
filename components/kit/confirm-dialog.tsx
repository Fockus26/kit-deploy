"use client";

import { useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmMatches } from "@/lib/kit/confirm";

/**
 * HANDOFF §2 · ConfirmDialog. Normal: primary confirm. Destructive: `confirmName` is the name
 * (project or host) the person must type; the destructive-solid button stays disabled until it
 * matches exactly. Initial focus is on Cancelar, Esc closes, focus returns to the trigger.
 * Presentational: `onConfirm` is the caller's.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
  confirmName,
  open,
  onOpenChange,
}: {
  /** The button that opens it (rendered through Radix's Trigger: pass a <Button>). */
  trigger?: React.ReactNode;
  /** An h2 that names the project and the deployment. */
  title: string;
  /** Muted text, e.g. the two SHAs. */
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Present → destructive variant: the exact text to type. */
  confirmName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <Body
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          onConfirm={onConfirm}
          confirmName={confirmName}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Mounted only while open (Radix unmounts the content), so the typed text resets by itself. */
function Body({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  confirmName,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  confirmName?: string;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const destructive = confirmName !== undefined;
  const enabled = !destructive || confirmMatches(typed, confirmName);

  return (
    <>
      <AlertDialogTitle>{title}</AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div>{description}</div>
      </AlertDialogDescription>
      {destructive ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <Label htmlFor={inputId} className="text-body">
            Escribe <span className="font-mono">{confirmName}</span> para
            confirmar
          </Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel asChild>
          <Button variant="outline">{cancelLabel}</Button>
        </AlertDialogCancel>
        <AlertDialogAction asChild>
          <Button
            variant={destructive ? "destructive-solid" : "default"}
            disabled={!enabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
