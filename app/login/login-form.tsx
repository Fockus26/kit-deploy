"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FormAlert, type Notice } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, startCodeSignIn } from "@/lib/auth/client";
import {
  type CallError,
  codeKind,
  codeSignInError,
  NETWORK,
  passkeySignInError,
} from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";

type Busy = "passkey" | "code" | null;
type CodeMode = "totp" | "recovery";

const CODE_COPY: Record<
  CodeMode,
  { heading: string; label: string; hint: string; other: string }
> = {
  totp: {
    heading: "Con el código de la app",
    label: "Código de la app",
    hint: "Los 6 dígitos que muestra ahora tu app de autenticación.",
    other: "Usar código de recuperación",
  },
  recovery: {
    heading: "Con un código de recuperación",
    label: "Código de recuperación",
    hint: "Uno de los que guardaste en el alta. Cada uno sirve una sola vez.",
    other: "Usar código de la app",
  },
};

/** Full navigation, so the server reads the new session cookie; `next` only on this origin. */
function goNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.assign(safeNextPath(next));
}

export function LoginForm() {
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  // HANDOFF §3 "Login": the code form opens from its two links. Either code goes through the
  // same form; `codeKind` still tells them apart, so the choice only changes the words.
  const [mode, setMode] = useState<CodeMode | null>(null);

  function choose(next: CodeMode) {
    setMode(next);
    setNotice(null);
  }

  useEffect(() => {
    if (mode) emailRef.current?.focus();
  }, [mode]);

  async function withPasskey() {
    setBusy("passkey");
    setNotice(null);
    try {
      const { error } = await authClient.signIn.passkey();
      if (!error) return goNext();
      setNotice(passkeySignInError(error as CallError));
    } catch {
      setNotice(NETWORK);
    }
    setBusy(null);
  }

  async function withCode(form: HTMLFormElement) {
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const code = String(data.get("code") ?? "").trim();
    setBusy("code");
    setNotice(null);
    try {
      const start = await startCodeSignIn(email);
      if (start.error) {
        setNotice(codeSignInError(start.error as CallError));
      } else {
        const { error } =
          codeKind(code) === "totp"
            ? await authClient.twoFactor.verifyTotp({ code })
            : await authClient.twoFactor.verifyBackupCode({ code });
        if (!error) return goNext();
        setNotice(codeSignInError(error as CallError));
      }
    } catch {
      setNotice(NETWORK);
    }
    setBusy(null);
    // The code is spent or wrong either way: clear it and put the focus back there.
    if (codeRef.current) {
      codeRef.current.value = "";
      codeRef.current.focus();
    }
  }

  return (
    <>
      <h1 className="mb-2 font-semibold text-foreground text-h1">
        Iniciar sesión
      </h1>
      <p className="mb-6 text-muted-foreground">
        Entra con la passkey de este dispositivo.
      </p>

      <FormAlert notice={notice} />

      <Button
        className="w-full"
        onClick={withPasskey}
        disabled={busy !== null}
        aria-busy={busy === "passkey"}
      >
        <KeyRound aria-hidden="true" />
        {busy === "passkey" ? "Esperando la passkey…" : "Entrar con passkey"}
      </Button>

      {mode === null ? (
        <div className="mt-6 flex flex-col items-center gap-1">
          <Button variant="ghost" onClick={() => choose("totp")}>
            Usar código de la app
          </Button>
          <Button variant="ghost" onClick={() => choose("recovery")}>
            Usar código de recuperación
          </Button>
        </div>
      ) : (
        <section aria-labelledby="code-heading" className="mt-8">
          <div className="mb-4 flex items-center gap-3">
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            <h2
              id="code-heading"
              className="text-center font-semibold text-foreground text-h2"
            >
              {CODE_COPY[mode].heading}
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <CodeForm
            mode={mode}
            busy={busy}
            hintId={hintId}
            emailRef={emailRef}
            codeRef={codeRef}
            onSubmit={(form) => void withCode(form)}
          />
          <div className="mt-4 flex justify-center">
            <Button
              variant="ghost"
              onClick={() => choose(mode === "totp" ? "recovery" : "totp")}
            >
              {CODE_COPY[mode].other}
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

function CodeForm({
  mode,
  busy,
  hintId,
  emailRef,
  codeRef,
  onSubmit,
}: {
  mode: CodeMode;
  busy: Busy;
  hintId: string;
  emailRef: React.RefObject<HTMLInputElement | null>;
  codeRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (form: HTMLFormElement) => void;
}) {
  return (
    <form
      // Never a GET: before hydration a native submit would put the code in the URL.
      method="post"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e.currentTarget);
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{CODE_COPY[mode].label}</Label>
        <Input
          ref={codeRef}
          id="code"
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={64}
          aria-describedby={hintId}
          className="font-mono"
        />
        <p id={hintId} className="text-caption text-muted-foreground">
          {CODE_COPY[mode].hint}
        </p>
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={busy !== null}
        aria-busy={busy === "code"}
      >
        {busy === "code" ? "Comprobando…" : "Entrar con código"}
      </Button>
    </form>
  );
}
