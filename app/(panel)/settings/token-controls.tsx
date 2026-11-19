"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createTokenAction,
  revokeTokenAction,
} from "@/app/(panel)/actions/projects";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { Field, FieldInput } from "@/components/kit/field";
import { Notice } from "@/components/kit/notice";
import { OptionSelect } from "@/components/kit/option-select";
import { TokenOnce } from "@/components/kit/token-once";
import { Button } from "@/components/ui/button";
import type { TokenRow } from "@/lib/db/tokens";
import type {
  TokenCreateResult,
  TokenRevokeResult,
} from "@/lib/panel/actions/projects";
import { MAX } from "@/lib/panel/schemas";

/** Revocar (HANDOFF §5b): the token's project typed in the dialog, checked again on the server. */
export function RevokeToken({ token }: { token: TokenRow }) {
  const [state, dispatch, pending] = useActionState<
    TokenRevokeResult | null,
    FormData
  >((_prev, form) => revokeTokenAction(null, form), null);

  function revoke() {
    const form = new FormData();
    form.set("id", token.id);
    form.set("confirm", token.project);
    startTransition(() => dispatch(form));
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="destructive-text" size="sm" loading={pending}>
            Revocar
          </Button>
        }
        title={`Revocar el token de ${token.project}`}
        description={
          <p>
            {token.label ? `«${token.label}». ` : ""}Los despliegues que lo usen
            dejarán de autenticarse. No se puede deshacer.
          </p>
        }
        confirmLabel="Revocar token"
        confirmName={token.project}
        onConfirm={revoke}
      />
      {state && !state.ok ? (
        <p role="alert" className="text-caption text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

type NewState =
  | TokenCreateResult
  /** "Ya lo guardé": the token is gone from state. */
  | { ok: "saved" }
  | null;

async function newStep(_prev: NewState, input: FormData | "clear") {
  if (input === "clear") return { ok: "saved" } as const;
  // `null`, not the previous state: an earlier token never rides along in a request.
  return createTokenAction(null, input);
}

/** "Nuevo token" (HANDOFF §3 Ajustes): shown once from the action's result, then dropped. */
export function NewTokenForm({ projects }: { projects: string[] }) {
  const [state, dispatch, pending] = useActionState<
    NewState,
    FormData | "clear"
  >(newStep, null);
  const [values, setValues] = useState({
    project: projects[0] ?? "",
    label: "",
  });

  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state?.ok === true) setValues((v) => ({ ...v, label: "" }));
    // The token card is gone: focus back where the form starts, not lost on <body>.
    if (state?.ok === "saved") heading.current?.focus();
  }, [state]);

  if (state?.ok === true) {
    return (
      <TokenOnce
        title={`Nuevo token de ${state.project}`}
        level={3}
        token={state.token}
        onDone={() => startTransition(() => dispatch("clear"))}
      >
        <p className="text-muted-foreground">
          Guárdalo como el secreto{" "}
          <span className="font-mono">KIT_DEPLOY_TOKEN</span> del repositorio de{" "}
          <span className="font-mono">{state.project}</span>, en lugar del
          anterior.
        </p>
      </TokenOnce>
    );
  }

  const failed = state && state.ok === false ? state : null;

  return (
    <form
      action={dispatch}
      aria-labelledby="nuevo-token"
      className="flex max-w-form-wide flex-col gap-4 rounded-lg lg:max-w-form-split border border-border bg-card p-5"
    >
      <h3
        ref={heading}
        id="nuevo-token"
        tabIndex={-1}
        className="font-semibold text-h3 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        Nuevo token
      </h3>
      {state?.ok === "saved" ? (
        <output className="block text-muted-foreground">
          Token guardado. Ya no se puede volver a ver.
        </output>
      ) : null}
      {failed ? <Notice tone="destructive" title={failed.message} /> : null}
      {projects.length === 0 ? (
        <p className="text-muted-foreground">
          Crea un proyecto primero: cada token es de un proyecto.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2 *:min-w-0">
            <Field label="Proyecto" error={failed?.fields?.project}>
              {(a11y) => (
                <OptionSelect
                  {...a11y}
                  name="project"
                  value={values.project}
                  onValueChange={(v) =>
                    setValues((s) => ({ ...s, project: v }))
                  }
                  options={projects.map((p) => ({ value: p, label: p }))}
                  className="font-mono"
                />
              )}
            </Field>
            <FieldInput
              label="Etiqueta (opcional)"
              name="label"
              value={values.label}
              onChange={(e) =>
                setValues((v) => ({ ...v, label: e.target.value }))
              }
              help="Para reconocerlo en la tabla, p. ej. «GitHub Actions»."
              error={failed?.fields?.label}
              maxLength={MAX.tokenLabel}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending}>
              Crear token
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
