"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A project's sections (brief §6 "Proyecto", row 2). Links, not ARIA tabs: each one is its own
 * page, so the current one carries `aria-current="page"` plus an underline and weight, never
 * color alone. Cron arrives in phase 06: shown, disabled, and saying so.
 */
export const PROJECT_TABS = [
  { segment: "", label: "Resumen" },
  { segment: "deployments", label: "Despliegues" },
  { segment: "previews", label: "Previews" },
  { segment: "env", label: "Variables" },
  { segment: "domains", label: "Dominios" },
  { segment: "logs", label: "Logs" },
  { segment: "databases", label: "Bases" },
  { segment: "cron", label: "Cron", disabled: "Fase 06" },
] as const satisfies readonly {
  segment: string;
  label: string;
  disabled?: string;
}[];

export function projectTabHref(project: string, segment: string): string {
  return segment ? `/p/${project}/${segment}` : `/p/${project}`;
}

const TAB =
  "-mb-px inline-flex min-h-control shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-body";

export function ProjectTabs({ project }: { project: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del proyecto" className="border-border border-b">
      {/* Narrow screens scroll the row inside its own box, never the page. */}
      <ul className="-mx-4 flex overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {PROJECT_TABS.map((tab) => {
          if ("disabled" in tab) {
            return (
              <li key={tab.label} className="flex">
                <span
                  aria-disabled="true"
                  className={cn(TAB, "border-transparent text-disabled")}
                >
                  {tab.label}
                  <span className="rounded-sm border border-border px-1 text-caption text-muted-foreground">
                    {tab.disabled}
                  </span>
                </span>
              </li>
            );
          }
          const href = projectTabHref(project, tab.segment);
          const active = pathname === href;
          return (
            <li key={tab.label} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  TAB,
                  "rounded-t-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-input hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
