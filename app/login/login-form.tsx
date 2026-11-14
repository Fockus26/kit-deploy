"use client";

import { KeyRound } from "lucide-react";
import { useId, useRef, useState } from "react";
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

/** Full navigation, so the server reads the new session cookie; `next` only on this origin. */
function goNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.assign(safeNextPath(next));
}

export function LoginForm() {
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

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

      <section aria-labelledby="code-heading" className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <h2
            id="code-heading"
            className="font-semibold text-foreground text-h2"
          >
            O con un código
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void withCode(e.currentTarget);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
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
            <Label htmlFor="code">Código</Label>
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
              Los 6 dígitos de tu app de autenticación, o uno de tus códigos de
              recuperación.
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
      </section>
    </>
  );
}
