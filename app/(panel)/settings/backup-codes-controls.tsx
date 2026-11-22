"use client";

import {
  type Ref,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  regenerateBackupCodesAction,
  viewBackupCodesAction,
} from "@/app/(panel)/actions/backup-codes";
import { RecoveryCodeList } from "@/components/auth/recovery-codes";
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
import type { BackupCodesResult } from "@/lib/panel/actions/backup-codes";

const CODE = /^\d{6}$/;
const digits = (s: string) => s.replace(/\s/g, "");

type Kind = "view" | "regenerate";

/**
 * Ajustes › Códigos de recuperación (D067): Ver códigos and Generar nuevos, each confirmed with
 * the authenticator app's current code, checked on the server. One dialog for both: "no codes
 * left" can switch it to Generar nuevos. The codes live only in the dialog's action state;
 * closing it unmounts that state, so they are gone. Focus goes back to the button that opened
 * it.
 */
export function BackupCodesControls() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("view");
  const viewButton = useRef<HTMLButtonElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);

  const start = (k: Kind) => {
    setKind(k);
    setOpen(true);
  };

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button
          ref={viewButton}
          variant="outline"
          size="sm"
          aria-haspopup="dialog"
          onClick={() => start("view")}
        >
          Ver códigos
        </Button>
        <Button
          ref={newButton}
          variant="outline"
          size="sm"
          aria-haspopup="dialog"
          onClick={() => start("regenerate")}
        >
          Generar nuevos
        </Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent
          // The code is what confirms: Body puts the cursor in its field, not on Cancelar.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            // No AlertDialogTrigger (one dialog, two buttons): Radix would drop focus on <body>.
            e.preventDefault();
            (kind === "view" ? viewButton : newButton).current?.focus();
          }}
        >
          <Body
            key={kind}
            kind={kind}
            // Body remounts with the new key, on the code field of Generar nuevos.
            onRegenerate={() => setKind("regenerate")}
          />
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* PLACEHOLDER (CONTENT_CHECKLIST row 46): the dialogs' texts are provisional. */
const TEXT = {
  view: {
    title: "Ver tus códigos de recuperación",
    intro:
      "Para mostrarlos, confirma que eres tú con el código de tu app de autenticación.",
    submit: "Ver códigos",
  },
  regenerate: {
    title: "Generar códigos de recuperación nuevos",
    intro:
      "Se crearán 10 códigos nuevos y los que tienes ahora dejarán de servir, también los que guardaste. No se puede deshacer.",
    submit: "Generar nuevos",
  },
} as const;

/** Mounted only while open (Radix unmounts the content): each opening starts clean. */
function Body({
  kind,
  onRegenerate,
}: {
  kind: Kind;
  onRegenerate: () => void;
}) {
  const action =
    kind === "view" ? viewBackupCodesAction : regenerateBackupCodesAction;
  // `null` as the previous state: codes shown once never ride along in a later request (D041).
  const [state, dispatch, pending] = useActionState<
    BackupCodesResult | null,
    FormData
  >((_prev, form) => action(null, form), null);
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const formId = useId();

  // On mount: when the dialog opens, and when "no codes left" switches it to Generar nuevos.
  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      list.current?.focus();
      return;
    }
    // A spent or wrong code is no use again: empty the field and put the cursor back.
    if (state.fields?.code) {
      setCode("");
      input.current?.focus();
    }
  }, [state]);

  if (state?.ok)
    return <Codes result={state} onRegenerate={onRegenerate} listRef={list} />;

  const failed = state && !state.ok ? state : null;
  // A field error is shown on the field; anything else (too many, no TOTP, session) on top.
  const general = failed && !failed.fields?.code ? failed.message : null;
  const text = TEXT[kind];
  const ready = CODE.test(digits(code));

  return (
    <>
      <AlertDialogTitle>{text.title}</AlertDialogTitle>
      <AlertDialogDescription>{text.intro}</AlertDialogDescription>
      <form
        id={formId}
        action={dispatch}
        onSubmit={(e) => {
          if (!ready || pending) e.preventDefault();
        }}
        className="mt-1 flex flex-col gap-3"
      >
        {general ? <Notice tone="destructive" title={general} /> : null}
        <FieldInput
          ref={input}
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
        <Button type="submit" form={formId} disabled={!ready} loading={pending}>
          {text.submit}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

function Codes({
  result,
  onRegenerate,
  listRef,
}: {
  result: Extract<BackupCodesResult, { ok: true }>;
  onRegenerate: () => void;
  listRef: Ref<HTMLOListElement>;
}) {
  const { kind, codes } = result;

  if (codes.length === 0)
    return (
      <>
        <AlertDialogTitle>No te queda ningún código</AlertDialogTitle>
        <AlertDialogDescription>
          Ya usaste los 10 códigos de recuperación. Genera nuevos para tener con
          qué entrar si pierdes la passkey y el teléfono.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cerrar</Button>
          </AlertDialogCancel>
          <Button onClick={onRegenerate}>Generar nuevos</Button>
        </AlertDialogFooter>
      </>
    );

  const n = codes.length;
  return (
    <>
      <AlertDialogTitle>
        {kind === "regenerate"
          ? "Tus códigos de recuperación nuevos"
          : "Tus códigos de recuperación"}
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="flex flex-col gap-3">
          {kind === "regenerate" ? (
            <Notice
              tone="warning"
              title="Guárdalos ahora: los anteriores ya no sirven"
            >
              Cada código te deja entrar una sola vez. Cuando cierres esta
              ventana no se volverán a mostrar aquí hasta que confirmes de
              nuevo.
            </Notice>
          ) : (
            <p>
              {n === 1
                ? "Te queda 1 código sin usar."
                : `Te quedan ${n} códigos sin usar.`}{" "}
              Cada uno sirve una sola vez.
            </p>
          )}
        </div>
      </AlertDialogDescription>
      <RecoveryCodeList
        codes={codes}
        copyLabel={n === 1 ? "Copiar el código" : `Copiar los ${n}`}
        listRef={listRef}
      />
      <AlertDialogFooter>
        <AlertDialogCancel asChild>
          <Button>Cerrar</Button>
        </AlertDialogCancel>
      </AlertDialogFooter>
    </>
  );
}
