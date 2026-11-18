import type * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PanelProject } from "@/lib/panel/projects";
import { PanelHeader } from "./panel-header";
import { Logo, SidebarNav } from "./sidebar-nav";

export const CONTENT_ID = "contenido";

const SKIP_LINK =
  "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-60 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:font-medium focus:text-primary-foreground focus:outline-2 focus:outline-ring focus:outline-offset-2";

/** HANDOFF §4: main padding 16 (< 768) / 24 (768–1023) / 32, max 1440 aligned left. */
const MAIN = "w-full min-w-0 max-w-content flex-1 p-4 md:p-6 lg:p-8";

/**
 * The signed-in frame (HANDOFF §3 "Shell", D021): a 240px sidebar from 1024px; below it the
 * mobile header and its sheet. One <main id="contenido">, reached by the skip link.
 */
export function PanelShell({
  projects,
  email,
  children,
}: {
  projects: PanelProject[];
  email: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <a href={`#${CONTENT_ID}`} className={SKIP_LINK}>
        Saltar al contenido
      </a>
      <div className="flex flex-1">
        <aside
          aria-label="Barra lateral"
          className="hidden w-sidebar shrink-0 flex-col border-border border-r bg-nav lg:sticky lg:top-0 lg:flex lg:h-dvh"
        >
          <div className="flex min-h-header items-center border-border border-b px-5">
            <Logo />
          </div>
          <SidebarNav projects={projects} email={email} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <PanelHeader projects={projects} email={email} />
          <main
            id={CONTENT_ID}
            tabIndex={-1}
            className={`${MAIN} outline-none`}
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

/** While the session is checked: the frame's outline, no data. */
export function PanelShellFallback() {
  return (
    <div className="flex flex-1">
      <div className="hidden w-sidebar shrink-0 border-border border-r bg-nav lg:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-header border-border border-b bg-nav lg:bg-background" />
        <div aria-busy="true" className={MAIN}>
          <p className="mb-4 text-muted-foreground">Cargando el panel…</p>
          <Skeleton className="mb-3 h-3.5 w-1/2" />
          <Skeleton className="mb-3 h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
    </div>
  );
}
