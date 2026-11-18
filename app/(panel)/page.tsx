import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { NEW_PROJECT_PATH } from "@/components/layout/sidebar-nav";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listProjects } from "@/lib/panel/projects";

export const metadata = { title: "Inicio" };

// PLACEHOLDER (CONTENT_CHECKLIST row 15): the real Inicio (server state, alerts, projects
// table) is wave 3 of phase 05; this copy is provisional until César confirms it.
export default function Home() {
  return (
    <>
      <h1 className="mb-2 font-semibold text-foreground text-h1">Inicio</h1>
      <p className="mb-6 text-muted-foreground">
        El estado del servidor, las alertas abiertas y la tabla de proyectos
        aparecerán aquí.
      </p>
      <Suspense
        fallback={
          <div aria-busy="true">
            <p className="mb-3 text-muted-foreground">Cargando proyectos…</p>
            <Skeleton className="mb-3 h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        }
      >
        <Projects />
      </Suspense>
    </>
  );
}

async function Projects() {
  const projects = await listProjects();
  if (projects.length > 0) {
    return (
      <p className="text-muted-foreground">
        {projects.length === 1
          ? "1 proyecto. Ábrelo desde la barra lateral."
          : `${projects.length} proyectos. Ábrelos desde la barra lateral.`}
      </p>
    );
  }
  return (
    <section
      aria-labelledby="sin-proyectos"
      className="rounded-lg border border-border bg-card p-6"
    >
      <h2
        id="sin-proyectos"
        className="mb-2 font-semibold text-foreground text-h2"
      >
        Aún no hay proyectos
      </h2>
      <p className="mb-4 text-muted-foreground">
        Crea el primero para conectar su repositorio y desplegarlo en el
        servidor.
      </p>
      <Link href={NEW_PROJECT_PATH} className={buttonVariants()}>
        <Plus aria-hidden="true" />
        Nuevo proyecto
      </Link>
    </section>
  );
}
