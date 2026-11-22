"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  projectFootprintAction,
  removeProjectAction,
} from "@/app/(panel)/actions/project-remove";
import { FieldInput } from "@/components/kit/field";
import { Notice } from "@/components/kit/notice";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ProjectFootprint } from "@/lib/db/project-remove";
import { confirmMatches } from "@/lib/kit/confirm";
import type {
  ProjectFootprintResult,
  ProjectRemoveResult,
} from "@/lib/panel/actions/project-remove";
import { useServerAction } from "./use-server-action";

const CODE = /^\d{6}$/;
const digits = (s: string) => s.replace(/\s/g, "");

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Eliminar proyecto (D069): what goes and what stays, then the project's name typed and the
 * authenticator app's current code. Unlike ConfirmDialog it stays open on a wrong code, with the
 * error on its field. Removed → the action redirects to Inicio (the project's pages are gone);
 * closed without removing → the caller puts focus back on what opened it.
 */
export function RemoveProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onOpenAutoFocus={(e) => {
          // The typed name is the first thing that confirms (the button stays off until both
          // fields are right): the cursor starts there, not on Cancelar.
          e.preventDefault();
          const content = e.currentTarget;
          if (content instanceof HTMLElement)
            content
              .querySelector<HTMLInputElement>("input[name=confirm]")
              ?.focus();
        }}
      >
        <Body project={project} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Mounted only while open (Radix unmounts the content): each opening starts clean. */
function Body({ project }: { project: string }) {
  const footprint = useServerAction(projectFootprintAction);
  const [state, dispatch, pending] = useActionState<
    ProjectRemoveResult | null,
    FormData
  >((_prev, form) => removeProjectAction(null, form), null);
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const formId = useId();
  const loadFootprint = useRef(footprint.run);
  loadFootprint.current = footprint.run;

  useEffect(() => {
    loadFootprint.current({ project });
  }, [project]);

  useEffect(() => {
    if (!state || state.ok) return;
    // A spent or wrong code is no use again: empty the field and put the cursor back.
    if (state.fields?.code) {
      setCode("");
      codeInput.current?.focus();
    } else if (state.fields?.confirm) nameInput.current?.focus();
  }, [state]);

  const failed = state && !state.ok ? state : null;
  const fieldError = failed?.fields?.code ?? failed?.fields?.confirm;
  // A field error is shown on its field; anything else (too many, no TOTP, agent, session) on top.
  const general = failed && !fieldError ? failed.message : null;
  const ready = confirmMatches(typed, project) && CODE.test(digits(code));

  return (
    <>
      {/* PLACEHOLDER (CONTENT_CHECKLIST row 49): the dialog's texts are provisional. */}
      <AlertDialogTitle>
        Eliminar <span className="font-mono">{project}</span>
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="flex flex-col gap-3">
          <p>
            Se quita del panel y del servidor, y no se puede deshacer: para
            volver a tenerlo habría que crearlo y desplegarlo de nuevo.
          </p>
          <div>
            <p className="font-medium text-foreground">Se elimina</p>
            <Gone project={project} result={footprint} />
          </div>
          <div>
            <p className="font-medium text-foreground">Se conserva</p>
            <ul className="list-disc ps-5">
              <li>
                Sus bases de datos{" "}
                <span className="font-mono [overflow-wrap:anywhere]">
                  {project}
                </span>{" "}
                y{" "}
                <span className="font-mono [overflow-wrap:anywhere]">
                  {project}_preview
                </span>
                , si existen: kit-deploy nunca borra una base.
              </li>
              <li>El registro de auditoría y las alertas cerradas.</li>
            </ul>
          </div>
        </div>
      </AlertDialogDescription>
      <form
        id={formId}
        action={dispatch}
        onSubmit={(e) => {
          if (!ready || pending) e.preventDefault();
        }}
        className="mt-1 flex flex-col gap-3"
      >
        <input type="hidden" name="project" value={project} />
        {general ? <Notice tone="destructive" title={general} /> : null}
        <FieldInput
          ref={nameInput}
          label={`Escribe ${project} para confirmar`}
          error={failed?.fields?.confirm}
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          // On the field's wrapper: a 40-character name in the label wraps at 320 px.
          className="[overflow-wrap:anywhere]"
        />
        <FieldInput
          ref={codeInput}
          label="Código de tu app de autenticación"
          help="Los 6 dígitos que muestra ahora."
          error={failed?.fields?.code}
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          spellCheck={false}
        />
      </form>
      <AlertDialogFooter>
        <AlertDialogCancel asChild>
          <Button variant="outline" disabled={pending}>
            Cancelar
          </Button>
        </AlertDialogCancel>
        <Button
          type="submit"
          form={formId}
          variant="destructive-solid"
          disabled={!ready || pending}
          loading={pending}
        >
          Eliminar proyecto
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** The footprint, read when the dialog opens: names and counts, never a value. */
function Gone({
  project,
  result,
}: {
  project: string;
  result: { state: ProjectFootprintResult | null; pending: boolean };
}) {
  const r = result.state;
  if (!r || result.pending)
    return <p aria-busy="true">Leyendo qué tiene {project}…</p>;
  if (!r.ok)
    return (
      <p>
        {r.message} Aun así, Eliminar quita todo lo suyo del panel y del
        servidor.
      </p>
    );
  return <FootprintList footprint={r.footprint} />;
}

function FootprintList({ footprint: f }: { footprint: ProjectFootprint }) {
  return (
    <ul className="list-disc ps-5">
      <li>
        {plural(f.deployments, "despliegue")} ({plural(f.previews, "preview")})
      </li>
      <li>
        {plural(f.hosts.length, "dominio")}
        {f.hosts.length > 0 ? (
          <>
            :{" "}
            <span className="font-mono [overflow-wrap:anywhere]">
              {f.hosts.join(", ")}
            </span>
          </>
        ) : null}
      </li>
      <li>{plural(f.variables, "variable")}</li>
      <li>{plural(f.tokens, "token de deploy", "tokens de deploy")}</li>
      <li>{plural(f.cronJobs, "cron job")}</li>
      {f.openAlerts > 0 ? (
        <li>
          {plural(f.openAlerts, "alerta abierta", "alertas abiertas")}: se
          cierran sin email
        </li>
      ) : null}
      <li>Sus contenedores, archivos de Caddy e imágenes en el servidor</li>
    </ul>
  );
}
