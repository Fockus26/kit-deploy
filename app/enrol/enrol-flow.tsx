"use client";

import { Download, KeyRound, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CopyButton } from "@/components/auth/copy-button";
import { FormAlert, type Notice } from "@/components/auth/form-alert";
import { TotpQr } from "@/components/auth/totp-qr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, redeemEnrolment } from "@/lib/auth/client";
import {
  type CallError,
  ENROL_COMMAND,
  isEnrolmentOver,
  NETWORK,
  passkeyRegisterError,
  totpConfirmError,
} from "@/lib/auth/messages";
import { LOGIN_PATH } from "@/lib/auth/next-path";

type Step =
  | { name: "opening" }
  | { name: "unavailable"; why: "link" | "expired" | "busy" }
  | { name: "offline" }
  | { name: "passkey"; email: string }
  | { name: "totp"; email: string; uri: string; codes: string[] }
  | { name: "codes"; codes: string[] }
  | { name: "done" };

const TOTAL = 3;

/** Reads the token from the fragment once and wipes it from the address bar and history. */
function takeToken(): string {
  const token = window.location.hash.slice(1);
  if (token) {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return token;
}

function secretOf(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP": easier to type by hand. */
function grouped(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}

function downloadCodes(codes: string[]) {
  const text = [
    "kit-deploy · códigos de recuperación (deploy.fockus.dev)",
    "Cada código sirve una sola vez.",
    "",
    ...codes,
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "kit-deploy-codigos-de-recuperacion.txt";
  a.click();
  URL.revokeObjectURL(url);
}

export function EnrolFlow() {
  const [step, setStep] = useState<Step>({ name: "opening" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const token = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hintId = useId();

  async function open() {
    setNotice(null);
    if (token.current === null) token.current = takeToken();
    const t = token.current;
    try {
      if (t) {
        const { data, error } = await redeemEnrolment(t);
        if (data) return setStep({ name: "passkey", email: data.email });
        const e = error as CallError;
        if (e?.status === 429)
          return setStep({ name: "unavailable", why: "busy" });
        if (e?.status && e.status < 500) {
          return setStep({ name: "unavailable", why: "link" });
        }
        return setStep({ name: "offline" });
      }
      // No token: a reload after the link was used. Resume if the enrolment session is alive.
      const { data } = await authClient.getSession();
      const until = (
        data?.session as { enrolUntil?: string | null } | undefined
      )?.enrolUntil;
      if (data && until && new Date(until).getTime() > Date.now()) {
        return setStep({ name: "passkey", email: data.user.email });
      }
      setStep({ name: "unavailable", why: "link" });
    } catch {
      setStep({ name: "offline" });
    }
  }

  // Once per page load (the ref survives React's development double effect).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
  });

  // A new link pasted into this same tab only changes the fragment: no reload, so start over.
  useEffect(() => {
    const onHash = () => {
      if (!window.location.hash) return;
      token.current = null;
      setStep({ name: "opening" });
      void open();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });

  // Each new step moves the focus to its heading, so a screen reader hears where it is.
  useEffect(() => {
    if (step.name !== "opening") heading.current?.focus();
  }, [step.name]);

  // Leaving before the recovery codes are saved loses them.
  useEffect(() => {
    if (step.name !== "codes" || saved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step.name, saved]);

  async function registerPasskey(email: string) {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await authClient.passkey.addPasskey({
        name: "kit-deploy",
      });
      if (error) {
        const e = error as CallError;
        if (isEnrolmentOver(e)) {
          setStep({ name: "unavailable", why: "expired" });
        } else {
          setAlreadyRegistered(
            e?.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
          );
          setNotice(passkeyRegisterError(e));
        }
      } else {
        await startTotp(email);
      }
    } catch {
      setNotice(NETWORK);
    }
    setBusy(false);
  }

  async function startTotp(email: string) {
    setNotice(null);
    const { data, error } = await authClient.twoFactor.enable({
      method: "totp",
    });
    if (data && "totpURI" in data) {
      return setStep({
        name: "totp",
        email,
        uri: data.totpURI,
        codes: data.backupCodes,
      });
    }
    if (isEnrolmentOver(error as CallError)) {
      return setStep({ name: "unavailable", why: "expired" });
    }
    setNotice(NETWORK);
  }

  async function confirmTotp(form: HTMLFormElement, codes: string[]) {
    const code = String(new FormData(form).get("code") ?? "").trim();
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (!error) {
        setStep({ name: "codes", codes });
      } else if ((error as CallError)?.status === 403) {
        setStep({ name: "unavailable", why: "expired" });
      } else {
        setNotice(totpConfirmError(error as CallError));
        const input = form.elements.namedItem("code");
        if (input instanceof HTMLInputElement) {
          input.value = "";
          input.focus();
        }
      }
    } catch {
      setNotice(NETWORK);
    }
    setBusy(false);
  }

  async function finish() {
    setBusy(true);
    try {
      // The enrolment session has done its job; signing in is a separate step.
      await authClient.signOut();
    } catch {
      // Not fatal: the enrolment session expires on its own and cannot reach the dashboard.
    }
    setBusy(false);
    setStep({ name: "done" });
  }

  const h1 = "mb-2 font-semibold text-foreground text-h1 outline-none";
  const eyebrow =
    "mb-2 font-medium text-eyebrow text-muted-foreground uppercase";

  if (step.name === "opening") {
    return (
      <>
        <h1 className={h1}>Alta en kit-deploy</h1>
        <output className="block text-muted-foreground">
          Abriendo el enlace de alta…
        </output>
      </>
    );
  }

  if (step.name === "unavailable" || step.name === "offline") {
    const offline = step.name === "offline";
    return (
      <>
        <h1 ref={heading} tabIndex={-1} className={h1}>
          {offline
            ? "No se pudo abrir el enlace"
            : step.why === "expired"
              ? "El alta caducó"
              : "Este enlace ya no sirve"}
        </h1>
        <Alert variant="destructive" className="my-6">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>
            {offline
              ? "Sin conexión con el panel"
              : step.why === "busy"
                ? "Demasiados intentos"
                : step.why === "expired"
                  ? "Pasaron más de 30 minutos"
                  : "Enlace caducado o ya usado"}
          </AlertTitle>
          <AlertDescription>
            {offline
              ? "Revisa tu conexión y vuelve a intentarlo: el enlace sigue sin usarse."
              : "Cada enlace de alta dura 15 minutos y sirve una sola vez; el alta se completa en 30 minutos."}
          </AlertDescription>
        </Alert>
        {offline ? (
          <Button className="w-full" onClick={() => void open()}>
            Reintentar
          </Button>
        ) : (
          <>
            <p className="mb-2">
              Pide un enlace nuevo desde tu terminal y ábrelo en este
              dispositivo:
            </p>
            <pre className="mb-3 overflow-x-auto whitespace-pre-wrap break-all rounded-sm bg-raised px-3 py-2 font-mono text-mono">
              <code>{ENROL_COMMAND}</code>
            </pre>
            <CopyButton value={ENROL_COMMAND} label="Copiar comando" />
          </>
        )}
      </>
    );
  }

  if (step.name === "done") {
    return (
      <>
        <h1 ref={heading} tabIndex={-1} className={h1}>
          Alta completada
        </h1>
        <p className="mb-6 text-muted-foreground">
          Tu cuenta ya tiene passkey y app de autenticación. Inicia sesión con
          la passkey para entrar al panel.
        </p>
        <a
          href={LOGIN_PATH}
          className={buttonVariants({ className: "w-full" })}
        >
          Ir a iniciar sesión
        </a>
      </>
    );
  }

  if (step.name === "passkey") {
    return (
      <>
        <p className={eyebrow}>Paso 1 de {TOTAL} · Passkey</p>
        <h1 ref={heading} tabIndex={-1} className={h1}>
          Registra tu passkey
        </h1>
        <p className="mb-2 text-muted-foreground">
          Alta para <span className="font-mono text-mono">{step.email}</span>.
        </p>
        <p className="mb-6 text-muted-foreground">
          La passkey es tu forma principal de entrar: tu dispositivo te pedirá
          la huella, la cara o el PIN.
        </p>
        <FormAlert notice={notice} />
        <Button
          className="w-full"
          onClick={() => void registerPasskey(step.email)}
          disabled={busy}
          aria-busy={busy}
        >
          <KeyRound aria-hidden="true" />
          {busy ? "Esperando al dispositivo…" : "Registrar passkey"}
        </Button>
        {alreadyRegistered && (
          <Button
            variant="outline"
            className="mt-3 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await startTotp(step.email);
              } catch {
                setNotice(NETWORK);
              }
              setBusy(false);
            }}
          >
            Seguir al paso 2
          </Button>
        )}
      </>
    );
  }

  if (step.name === "totp") {
    const secret = secretOf(step.uri);
    return (
      <>
        <p className={eyebrow}>Paso 2 de {TOTAL} · App de autenticación</p>
        <h1 ref={heading} tabIndex={-1} className={h1}>
          Añade el código de respaldo
        </h1>
        <p className="mb-6 text-muted-foreground">
          Si un día no tienes la passkey a mano, entrarás con tu email y el
          código de 6 dígitos de una app de autenticación.
        </p>
        <ol className="mb-6 flex list-decimal flex-col gap-4 pl-5">
          <li>
            <p className="mb-3">
              Escanea este código QR con tu app de autenticación.
            </p>
            <TotpQr uri={step.uri} />
          </li>
          <li>
            <p className="mb-2">Si no puedes escanearlo, escribe esta clave:</p>
            <p className="mb-2 break-all rounded-sm bg-raised px-3 py-2 font-mono text-mono">
              {grouped(secret)}
            </p>
            <CopyButton value={secret} label="Copiar clave" />
          </li>
        </ol>
        <FormAlert notice={notice} />
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmTotp(e.currentTarget, step.codes);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="totp">Código de 6 dígitos</Label>
            <Input
              id="totp"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              aria-describedby={hintId}
              className="font-mono"
            />
            <p id={hintId} className="text-caption text-muted-foreground">
              El que muestra ahora tu app para kit-deploy.
            </p>
          </div>
          <Button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Comprobando…" : "Confirmar código"}
          </Button>
        </form>
      </>
    );
  }

  // step.name === "codes"
  const codes = step.codes;
  return (
    <>
      <p className={eyebrow}>Paso 3 de {TOTAL} · Códigos de recuperación</p>
      <h1 ref={heading} tabIndex={-1} className={h1}>
        Guárdalos ahora
      </h1>
      <Alert variant="warning" className="my-6">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Solo se muestran esta vez</AlertTitle>
        <AlertDescription>
          Si pierdes la passkey y el teléfono, cada uno de estos códigos te deja
          entrar una sola vez. Guárdalos en tu gestor de contraseñas.
        </AlertDescription>
      </Alert>
      <ol
        aria-label="Códigos de recuperación"
        className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-border bg-raised p-4 font-mono text-mono min-[360px]:grid-cols-2"
      >
        {codes.map((c) => (
          <li key={c} className="break-all">
            {c}
          </li>
        ))}
      </ol>
      <div className="mb-6 flex flex-wrap gap-3">
        <CopyButton value={codes.join("\n")} label="Copiar los 10" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCodes(codes)}
        >
          <Download aria-hidden="true" />
          Descargar .txt
        </Button>
      </div>
      <div className="mb-6 flex items-start gap-3">
        <input
          id="saved"
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.currentTarget.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        />
        <Label htmlFor="saved" className="font-normal">
          Ya guardé los códigos en un lugar seguro.
        </Label>
      </div>
      <Button
        className="w-full"
        disabled={!saved || busy}
        aria-busy={busy}
        onClick={() => void finish()}
      >
        Terminar el alta
      </Button>
    </>
  );
}
