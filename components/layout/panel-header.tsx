"use client";

import { ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { PanelProject } from "@/lib/panel/projects";
import { PROJECT_TABS } from "./project-tabs";
import { NEW_PROJECT_PATH, SETTINGS_PATH, SidebarNav } from "./sidebar-nav";
import { ThemeSwitch } from "./theme-switch";

type Crumb = { label: string; href: string; mono?: boolean };

/** Inicio › <project> › <section>, from the URL. */
export function breadcrumbs(pathname: string): Crumb[] {
  const home: Crumb = { label: "Inicio", href: "/" };
  const [first, project, section] = pathname.split("/").filter(Boolean);
  if (!first) return [home];
  if (first === NEW_PROJECT_PATH.slice(1))
    return [home, { label: "Nuevo proyecto", href: NEW_PROJECT_PATH }];
  if (first === SETTINGS_PATH.slice(1))
    return [home, { label: "Ajustes", href: SETTINGS_PATH }];
  if (first === "p" && project) {
    const base = `/p/${project}`;
    const crumbs: Crumb[] = [home, { label: project, href: base, mono: true }];
    const tab = PROJECT_TABS.find((t) => t.segment === section);
    if (section && tab)
      crumbs.push({ label: tab.label, href: `${base}/${section}` });
    return crumbs;
  }
  return [home];
}

export function PanelHeader({
  projects,
  email,
}: {
  projects: PanelProject[];
  email: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const crumbs = breadcrumbs(pathname);
  return (
    <header className="sticky top-0 z-40 flex min-h-header items-center gap-2 border-border border-b bg-background px-4 lg:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Abrir navegación"
          className="inline-flex size-control shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 lg:hidden"
        >
          <Menu aria-hidden="true" className="size-4" />
        </SheetTrigger>
        <SheetContent closeLabel="Cerrar navegación">
          <div className="flex min-h-header items-center px-6 pr-14">
            <SheetTitle className="font-mono font-semibold">
              kit-deploy
            </SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            Navegación del panel
          </SheetDescription>
          <SidebarNav
            projects={projects}
            email={email}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <nav aria-label="Ruta" className="min-w-0 flex-1">
        <ol className="flex flex-wrap items-center gap-1 text-body">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={c.href} className="flex min-w-0 items-center gap-1">
                {i > 0 && (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
                {last ? (
                  <span
                    aria-current="page"
                    className={
                      c.mono
                        ? "break-all font-medium font-mono text-foreground text-mono"
                        : "font-medium text-foreground"
                    }
                  >
                    {c.label}
                  </span>
                ) : (
                  <Link
                    href={c.href}
                    className={`rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${c.mono ? "break-all font-mono text-mono" : ""}`}
                  >
                    {c.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <ThemeSwitch />
    </header>
  );
}
