"use client";

import { FolderGit2, House, Layers, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import type { PanelProject } from "@/lib/panel/projects";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./sign-out-button";

export const NEW_PROJECT_PATH = "/new";
export const SETTINGS_PATH = "/settings";

/** HANDOFF §5: lucide `Layers` in primary + "kit-deploy" 15/600, until a logo of its own. */
export function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="inline-flex items-center gap-2 rounded-sm font-semibold text-foreground text-h2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      <Layers aria-hidden="true" className="size-4 text-primary" />
      kit-deploy
    </Link>
  );
}

/** The panel's navigation (HANDOFF §2 Sidebar): the sidebar from 1024px, and the sheet below. */
export function SidebarNav({
  projects,
  email,
  onNavigate,
}: {
  projects: PanelProject[];
  email: string;
  /** The sheet closes itself when a link is followed. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isProject = (name: string) =>
    pathname === `/p/${name}` || pathname.startsWith(`/p/${name}/`);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Principal" className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          <li>
            <NavLink
              href="/"
              current={pathname === "/"}
              icon={House}
              onNavigate={onNavigate}
            >
              Inicio
            </NavLink>
          </li>
        </ul>

        <p
          id="nav-proyectos"
          className="mt-6 mb-2 px-2 font-medium text-eyebrow text-muted-foreground uppercase"
        >
          Proyectos
        </p>
        {projects.length === 0 ? (
          <p className="px-2 text-caption text-muted-foreground">
            Aún no hay proyectos.
          </p>
        ) : (
          <ul aria-labelledby="nav-proyectos" className="flex flex-col gap-1">
            {projects.map((p) => (
              <li key={p.name}>
                <NavLink
                  href={`/p/${p.name}`}
                  current={isProject(p.name)}
                  icon={FolderGit2}
                  onNavigate={onNavigate}
                  mono
                >
                  {p.name}
                </NavLink>
              </li>
            ))}
          </ul>
        )}

        <ul className="mt-6 flex flex-col gap-1">
          <li>
            <NavLink
              href={NEW_PROJECT_PATH}
              current={pathname === NEW_PROJECT_PATH}
              icon={Plus}
              onNavigate={onNavigate}
            >
              Nuevo proyecto
            </NavLink>
          </li>
          <li>
            <NavLink
              href={SETTINGS_PATH}
              current={pathname === SETTINGS_PATH}
              icon={Settings}
              onNavigate={onNavigate}
            >
              Ajustes
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="border-border border-t p-3">
        <p className="mb-3 px-2 text-caption text-muted-foreground">
          Sesión de{" "}
          <span className="font-mono text-foreground wrap-anywhere">
            {email}
          </span>
        </p>
        <SignOutButton />
      </div>
    </div>
  );
}

function NavLink({
  href,
  current,
  icon: Icon,
  mono = false,
  onNavigate,
  children,
}: {
  href: string;
  current: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  mono?: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(
        // Current: raised surface + weight 500 + aria-current (HANDOFF §2), not color alone.
        "flex min-h-9 items-center gap-2 rounded-md px-2 py-1 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        current
          ? "bg-raised font-medium text-foreground"
          : "text-muted-foreground hover:bg-raised/60 hover:text-foreground",
      )}
    >
      <Icon aria-hidden={true} className="size-4 shrink-0" />
      {/* Names up to 40 characters wrap anywhere instead of being cut. */}
      <span
        className={cn("min-w-0 wrap-anywhere", mono && "font-mono text-mono")}
      >
        {children}
      </span>
    </Link>
  );
}
