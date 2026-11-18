"use client";

import { Ellipsis, Power, Rocket, RotateCw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  redeployAction,
  restartAction,
  stopAction,
} from "@/app/(panel)/actions/deployments";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { Notice } from "@/components/kit/notice";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ActionKind, type Outcome, outcomeOf } from "@/lib/kit/outcome";
import { RollbackButton, type RollbackTarget } from "./rollback-button";
import { useServerAction } from "./use-server-action";

export type ProjectActionsProps = {
  project: string;
  hasLive: boolean;
  liveSha: string | null;
  rollback: RollbackTarget & { available: boolean };
  /** Docker's view of production's container: stopped (Parar off, Reiniciar says Iniciar). */
  container: "running" | "stopped" | "unknown";
};

/**
 * HANDOFF §3 Proyecto · cabecera: Reiniciar, Parar, Rollback and Redeploy (primary) in a
 * wrapping row; below 768 only Redeploy and Rollback stay, the other two go to "Más acciones".
 * One Notice (role status or alert) tells how the last action went.
 */
export function ProjectActions({
  project,
  hasLive,
  liveSha,
  rollback,
  container,
}: ProjectActionsProps) {
  const redeploy = useServerAction(redeployAction);
  const restart = useServerAction(restartAction);
  const stop = useServerAction(stopAction);
  const [rolling, setRolling] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [notice, setNotice] = useState<Outcome | null>(null);
  const hint = useId();
  const menu = useRef<HTMLButtonElement>(null);
  const fromMenu = useRef(false);
  const shas = useRef({ target: rollback.sha });
  shas.current = { target: rollback.sha };

  function speak(kind: ActionKind, r: Parameters<typeof outcomeOf>[1]) {
    setNotice(outcomeOf(kind, r, shas.current));
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new result speaks
  useEffect(() => {
    if (redeploy.state) speak("redeploy", redeploy.state);
  }, [redeploy.state]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new result speaks
  useEffect(() => {
    if (restart.state) speak("restart", restart.state);
  }, [restart.state]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new result speaks
  useEffect(() => {
    if (stop.state) speak("stop", stop.state);
  }, [stop.state]);

  const busy = redeploy.pending || restart.pending || stop.pending || rolling;
  const canStop = hasLive && container !== "stopped";
  const restartLabel = container === "stopped" ? "Iniciar" : "Reiniciar";

  function doRestart() {
    setNotice(null);
    restart.run({ project });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 md:items-end">
      <div className="flex flex-wrap gap-2">
        <div className="hidden gap-2 md:flex">
          <Button
            variant="outline"
            disabled={!hasLive || busy}
            aria-describedby={hasLive ? undefined : hint}
            loading={restart.pending}
            onClick={doRestart}
          >
            <RotateCw aria-hidden="true" />
            {restartLabel}
          </Button>
          <Button
            variant="destructive-text"
            disabled={!canStop || busy}
            aria-describedby={hasLive ? undefined : hint}
            loading={stop.pending}
            onClick={() => {
              fromMenu.current = false;
              setStopOpen(true);
            }}
          >
            <Power aria-hidden="true" />
            Parar
          </Button>
        </div>
        <RollbackButton
          project={project}
          fromSha={liveSha}
          to={rollback}
          disabled={!rollback.available || busy}
          onPending={setRolling}
          onResult={(r) => speak("rollback", r)}
        />
        <Button
          disabled={!hasLive || busy}
          aria-describedby={hasLive ? undefined : hint}
          loading={redeploy.pending}
          onClick={() => {
            setNotice(null);
            redeploy.run({ project });
          }}
        >
          <Rocket aria-hidden="true" />
          Redeploy
        </Button>
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menu}
                variant="outline"
                aria-label="Más acciones"
                disabled={!hasLive || busy}
                className="size-11 px-0"
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={doRestart}>
                <RotateCw aria-hidden="true" />
                {restartLabel}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canStop}
                className="text-destructive"
                onSelect={() => {
                  fromMenu.current = true;
                  setStopOpen(true);
                }}
              >
                <Power aria-hidden="true" />
                Parar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {hasLive ? null : (
        <p id={hint} className="text-caption text-muted-foreground">
          Sin nada en vivo en producción: no hay qué redesplegar, reiniciar ni
          parar.
        </p>
      )}
      <ConfirmDialog
        open={stopOpen}
        onOpenChange={(open) => {
          setStopOpen(open);
          // The menu item that opened it is gone: focus goes back to the menu's button.
          if (!open && fromMenu.current) {
            setTimeout(() => menu.current?.focus(), 0);
          }
        }}
        title={`Parar producción de ${project}`}
        description={
          <p>
            El sitio responde 502 hasta que lo reinicies.
            {liveSha ? (
              <>
                {" "}
                Está sirviendo <span className="font-mono">{liveSha}</span>.
              </>
            ) : null}
          </p>
        }
        confirmName={project}
        confirmLabel="Parar producción"
        onConfirm={() => {
          setNotice(null);
          stop.run({ project, confirm: project });
        }}
      />
      {notice ? (
        <Notice
          tone={notice.tone}
          title={notice.title}
          className="w-full md:max-w-md"
          actions={
            <Button variant="ghost" size="sm" onClick={() => setNotice(null)}>
              Cerrar
            </Button>
          }
        >
          {notice.body}
        </Notice>
      ) : null}
    </div>
  );
}
