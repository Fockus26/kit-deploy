import { Suspense } from "react";
import {
  PanelShell,
  PanelShellFallback,
} from "@/components/layout/panel-shell";
import { NotFoundCard } from "@/components/states/not-found-card";
import { listProjects } from "@/lib/panel/projects";
import { sessionUser } from "@/lib/panel/session";

export const metadata = { title: "No existe" };

/**
 * HANDOFF §5b · 404 for an address no route matches, and the one proxy.ts rewrites an unknown
 * `/p/<name>` to (with the 404 status set there). With a session it sits inside the shell; with
 * none (a forged cookie, a public path) it is the bare card — it never redirects.
 */
export default function NotFound() {
  return (
    <Suspense fallback={<PanelShellFallback />}>
      <MaybeShell />
    </Suspense>
  );
}

async function MaybeShell() {
  const user = await sessionUser();
  if (!user)
    return (
      <main className="flex flex-1 px-4">
        <NotFoundCard />
      </main>
    );
  const projects = await listProjects();
  return (
    <PanelShell projects={projects} email={user.email}>
      <NotFoundCard />
    </PanelShell>
  );
}
