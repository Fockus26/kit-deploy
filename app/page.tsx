import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { requestUser } from "@/lib/auth";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { SignOutButton } from "./sign-out-button";

/** The real check (proxy.ts only looks at the cookie): an enrolment or expired session goes to
 * /login too. Runs per request, inside Suspense (cacheComponents). */
async function SignedIn() {
  const user = await requestUser(await headers());
  if (!user) redirect(LOGIN_PATH);
  return (
    <>
      <h1 className="mb-2 font-semibold text-foreground text-h1">
        Sesión iniciada
      </h1>
      <p className="mb-6 text-muted-foreground">
        Entraste como{" "}
        <span className="font-mono text-foreground text-mono">
          {user.email}
        </span>
        . El panel de despliegues llega en la fase 05.
      </p>
      <SignOutButton />
    </>
  );
}

export default function Home() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <output className="block text-muted-foreground">
            Comprobando la sesión…
          </output>
        }
      >
        <SignedIn />
      </Suspense>
    </AuthShell>
  );
}
