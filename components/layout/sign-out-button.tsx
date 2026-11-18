"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { LOGIN_PATH } from "@/lib/auth/next-path";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const { error } = await authClient.signOut();
            if (!error) return window.location.assign(LOGIN_PATH);
          } catch {
            // Reported below.
          }
          setFailed(true);
          setBusy(false);
        }}
      >
        <LogOut aria-hidden="true" />
        {busy ? "Cerrando sesión…" : "Cerrar sesión"}
      </Button>
      <p role="alert" className="mt-2 text-caption text-destructive empty:mt-0">
        {failed ? "No se pudo cerrar la sesión. Vuelve a intentarlo." : ""}
      </p>
    </>
  );
}
