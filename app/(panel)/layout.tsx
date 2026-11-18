import { Suspense } from "react";
import {
  PanelShell,
  PanelShellFallback,
} from "@/components/layout/panel-shell";
import { listProjects } from "@/lib/panel/projects";
import { panelUser } from "@/lib/panel/session";

/** Everything behind the session: /login, /enrol, /preview-access and /api/* stay outside. */
export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<PanelShellFallback />}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

/** The real check runs per request, inside Suspense (cacheComponents). */
async function SignedIn({ children }: { children: React.ReactNode }) {
  const user = await panelUser();
  const projects = await listProjects();
  return (
    <PanelShell projects={projects} email={user.email}>
      {children}
    </PanelShell>
  );
}
