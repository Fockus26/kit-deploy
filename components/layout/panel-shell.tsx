import Link from "next/link";
import type * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PanelProject } from "@/lib/panel/projects";
import { PanelHeader } from "./panel-header";
import { SidebarNav } from "./sidebar-nav";

export const CONTENT_ID = "contenido";

const SKIP_LINK =
  "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:font-medium focus:text-primary-foreground focus:outline-2 focus:outline-ring focus:outline-offset-2";

/**
 * The signed-in frame (brief §2, §6; D021): a 240px sidebar from `lg`, a sticky header with
 * the breadcrumbs, the drawer and the theme switch, and one <main> up to 1440px.
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
      <aside
        aria-label="Barra lateral"
        className="hidden border-border border-r bg-nav lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-sidebar lg:flex-col"
      >
        <div className="flex min-h-header items-center border-border border-b px-6">
          <Link
            href="/"
            className="rounded-sm font-mono font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            kit-deploy
          </Link>
        </div>
        <SidebarNav projects={projects} email={email} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-sidebar">
        <PanelHeader projects={projects} email={email} />
        <main
          id={CONTENT_ID}
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-content flex-1 px-4 py-6 outline-none lg:px-6"
        >
          {children}
        </main>
      </div>
    </>
  );
}

/** While the session is checked: the frame's outline, no data. */
export function PanelShellFallback() {
  return (
    <div className="flex flex-1">
      <div className="hidden border-border border-r bg-nav lg:block lg:w-sidebar" />
      <div className="flex flex-1 flex-col">
        <div className="min-h-header border-border border-b" />
        <div className="mx-auto w-full max-w-content px-4 py-6 lg:px-6">
          <output className="mb-4 block text-muted-foreground">
            Comprobando la sesión…
          </output>
          <Skeleton className="mb-3 h-8 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
