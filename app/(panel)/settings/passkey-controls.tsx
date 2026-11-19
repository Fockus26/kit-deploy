"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { removePasskeyAction } from "@/app/(panel)/actions/passkeys";
import { FieldInput } from "@/components/kit/field";
import { Notice } from "@/components/kit/notice";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { PasskeyRemoveResult } from "@/lib/panel/actions/passkeys";

const CODE = /^\d{6}$/;
const digits = (s: string) => s.replace(/\s/g, "");

export type RemovedNotice = { name: string | null; removed: boolean };

/**
 * Eliminar (D055): the dialog asks for the authenticator app's current code, which the server
 * checks before deleting. Unlike ConfirmDialog it stays open on a wrong code, with the error on
 * the field. Removed → the row is gone, so focus goes to the table's notice (`onRemoved`).
 */
export function RemovePasskey({
  passkey,
  last,
  onRemoved,
}: {
  passkey: { id: string; name: string | null };
  /** The account's only passkey: the dialog says how to get back in. */
  last: boolean;
  onRemoved: (n: RemovedNotice) => void;
}) {
  const [open, setOpen] = useState(false);
  const done = useRef<RemovedNotice | null>(null);
  const label = passkey.name
    ? `la passkey «${passkey.name}»`
    : "la passkey sin nombre";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive-text"
          size="sm"
          aria-label={`Eliminar ${label}`}
        >
          Eliminar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          // The code is what confirms (the button stays off until it has 6 digits): the cursor
          // starts in its field, not on Cancelar.
          e.preventDefault();
          e.currentTarget
            ?.querySelector<HTMLInputElement>("input[name=code]")
            ?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const n = done.current;
          if (!n) return;
          // The trigger leaves with its row: Radix would drop focus on <body>.
          e.preventDefault();
          done.current = null;
          onRemoved(n);
        }}
      >
        <Body
          passkey={passkey}
          label={label}
          last={last}
          onDone={(n) => {
            done.current = n;
            setOpen(false);
          }}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Mounted only while open (Radix unmounts the content): each opening starts clean. */
function Body({
  passkey,
  label,
  last,
  onDone,
}: {
  passkey: { id: string; name: string | null };
  label: string;
  last: boolean;
  onDone: (n: RemovedNotice) => void;
}) {
  const [state, dispatch, pending] = useActionState<
    PasskeyRemoveResult | null,
    FormData
  >((_prev, form) => removePasskeyAction(null, form), null);
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const formId = useId();
  // Read at the result, not a dependency: a new `onDone` must not replay an old result.
  const finish = useRef(() => {});
  finish.current = () => {
    if (state?.ok)
      onDone({ name: state.name ?? passkey.name, removed: state.removed });
  };

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      finish.current();
      return;
    }
    // A spent or wrong code is no use again: empty the field and put the cursor back.
    if (state.fields?.code) {
      setCode("");
      input.current?.focus();
    }
  }, [state]);

  const failed = state && !state.ok ? state : null;
  // A field error is shown on the field; anything else (too many, no TOTP, session) on top.
  const general = failed && !failed.fields?.code ? failed.message : null;

  return (
    <>
      {/* PLACEHOLDER (CONTENT_CHECKLIST row 41): the dialog's texts are provisional. */}
      <AlertDialogTitle>Eliminar {label}</AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="flex flex-col gap-2">
          <p>
            Ese dispositivo dejará de poder entrar al panel. No se puede
            deshacer: para volver a usarlo tendrás que registrarlo con un enlace
            de alta.
          </p>
          {last ? (
            <p>
              Es tu única passkey. Después entrarás con tu app de autenticación
              o un código de recuperación.
            </p>
          ) : null}
        </div>
      </AlertDialogDescription>
      <form
        id={formId}
        action={dispatch}
        onSubmit={(e) => {
          if (!CODE.test(digits(code))) e.preventDefault();
        }}
        className="mt-1 flex flex-col gap-3"
      >
        <input type="hidden" name="id" value={passkey.id} />
        {general ? <Notice tone="destructive" title={general} /> : null}
        <FieldInput
          ref={input}
          label="Código de tu app de autenticación"
          help="Los 6 dígitos que muestra ahora."
          error={failed?.fields?.code ?? failed?.fields?.id}
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
          disabled={!CODE.test(digits(code))}
          loading={pending}
        >
          Eliminar passkey
        </Button>
      </AlertDialogFooter>
    </>
  );
}
