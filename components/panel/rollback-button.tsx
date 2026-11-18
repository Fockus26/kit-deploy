"use client";

import { Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rollbackAction } from "@/app/(panel)/actions/deployments";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { RollbackResult } from "@/lib/panel/actions/deployments";
import { useServerAction } from "./use-server-action";

export type RollbackTarget = {
  /** A kept deployment ("Rollback a este"); null: one step back, the platform picks it. */
  id: string | null;
  sha: string | null;
};

/**
 * Rollback with its ConfirmDialog (HANDOFF §5b: names the project and both SHAs, primary
 * "Hacer rollback"). The server action wants the project's name as confirmation: the dialog is the
 * confirmation, so the name goes along with the click. `onResult`: the caller shows the outcome
 * (the header); without it a short line under the button does.
 */
export function RollbackButton({
  project,
  fromSha,
  to,
  label = "Rollback",
  size,
  disabled,
  onResult,
  onPending,
}: {
  project: string;
  /** What serves now. */
  fromSha: string | null;
  to: RollbackTarget;
  label?: string;
  size?: "default" | "sm";
  disabled?: boolean;
  onResult?: (r: RollbackResult) => void;
  onPending?: (pending: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const { state, pending, run } = useServerAction(rollbackAction);
  const report = useRef(onResult);
  report.current = onResult;
  const busy = useRef(onPending);
  busy.current = onPending;
  useEffect(() => {
    if (state) report.current?.(state);
  }, [state]);
  useEffect(() => {
    busy.current?.(pending);
  }, [pending]);

  const target = to.sha ? <Sha value={to.sha} /> : "el despliegue anterior";
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size={size}
        disabled={disabled}
        loading={pending}
        onClick={() => setOpen(true)}
      >
        <Undo2 aria-hidden="true" />
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Rollback de ${project}${to.sha ? ` a ${to.sha}` : ""}`}
        description={
          <p>
            Producción pasa de {fromSha ? <Sha value={fromSha} /> : "—"} a{" "}
            {target}. Se arranca la imagen guardada y el tráfico cambia solo si
            pasa /api/health.
          </p>
        }
        confirmLabel="Hacer rollback"
        onConfirm={() =>
          run({ project, confirm: project, ...(to.id ? { to: to.id } : {}) })
        }
      />
      {!onResult && state ? (
        state.ok ? (
          <output className="block text-caption text-muted-foreground">
            Producción vuelve a {to.sha ?? "el despliegue anterior"} en{" "}
            {state.seconds} s.
          </output>
        ) : (
          <p role="alert" className="max-w-56 text-caption text-destructive">
            {state.message}
          </p>
        )
      ) : null}
    </div>
  );
}

function Sha({ value }: { value: string }) {
  return <span className="font-mono">{value}</span>;
}
