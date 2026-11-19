"use client";

import { Menu } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { PROJECT_TABS } from "./project-tabs";
import {
  Logo,
  NEW_PROJECT_PATH,
  SETTINGS_PATH,
  SidebarNav,
} from "./sidebar-nav";
import { ThemeSwitch } from "./theme-switch";

type Crumb = { label: string; href: string; mono?: boolean };

/** Inicio / <project> / <section>, from the URL. */
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

/**
 * HANDOFF §3 Shell: from 1024px, breadcrumbs left and the theme switch right; below, the mobile
 * header (`--nav`): menu button 44×44, the logo and only the current crumb, and a 280px sheet
 * with the sidebar's content.
 */
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
    <header className="sticky top-0 z-20 flex min-h-header flex-wrap items-center gap-x-2 gap-y-1 border-border border-b bg-nav px-2 py-1 md:px-4 lg:bg-background lg:px-8">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Abrir navegación"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 lg:hidden"
        >
          <Menu aria-hidden="true" className="size-4" />
        </SheetTrigger>
        <SheetContent closeLabel="Cerrar navegación">
          <div className="flex min-h-header items-center px-5 pr-14">
            <Logo onNavigate={() => setOpen(false)} />
          </div>
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <SheetDescription className="sr-only">
            Inicio, proyectos y ajustes del panel
          </SheetDescription>
          <SidebarNav
            projects={projects}
            email={email}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <div className="shrink-0 lg:hidden">
        <Logo />
      </div>

      <nav aria-label="Migas" className="min-w-0 flex-1">
        <ol className="flex flex-wrap items-center gap-x-2 text-mono">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li
                key={c.href}
                className={cn(
                  "min-w-0 items-center gap-2",
                  // Below 1024 only the current page: the logo already leads home.
                  last ? "flex" : "hidden lg:flex",
                )}
              >
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className="hidden text-muted-foreground lg:inline"
                  >
                    /
                  </span>
                )}
                {last ? (
                  <span
                    aria-current="page"
                    className={cn(
                      "block truncate text-foreground",
                      c.mono && "font-mono",
                    )}
                  >
                    {c.label}
                  </span>
                ) : (
                  <Link
                    href={c.href}
                    className={cn(
                      "block truncate rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                      c.mono && "font-mono",
                    )}
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
