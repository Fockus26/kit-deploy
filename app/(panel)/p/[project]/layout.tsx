import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { findProject } from "@/lib/panel/projects";

/** A project's frame: its header (placeholder until wave 3) and its sections' tabs. */
export default function ProjectLayout({
  params,
  children,
}: LayoutProps<"/p/[project]">) {
  return (
    <Suspense
      fallback={
        <>
          <Skeleton className="mb-4 h-8 w-64" />
          <Skeleton className="mb-6 h-control w-full" />
        </>
      }
    >
      <ProjectFrame params={params}>{children}</ProjectFrame>
    </Suspense>
  );
}

async function ProjectFrame({
  params,
  children,
}: {
  params: LayoutProps<"/p/[project]">["params"];
  children: React.ReactNode;
}) {
  const { project: name } = await params;
  const project = await findProject(name);
  if (!project) notFound();
  return (
    <>
      <header className="mb-4">
        <p className="mb-1 text-eyebrow text-muted-foreground uppercase">
          Proyecto
        </p>
        <h1 className="break-all font-mono font-semibold text-foreground text-h1">
          {project.name}
        </h1>
        {/* PLACEHOLDER (CONTENT_CHECKLIST row 16): status, domain, branch@SHA and the
            Reiniciar / Parar / Rollback / Redeploy actions arrive with the Resumen page. */}
        <p className="mt-1 text-muted-foreground">
          Estado de producción, dominio y último despliegue: aparecerán aquí.
        </p>
      </header>
      <ProjectTabs project={project.name} />
      <div className="pt-6">{children}</div>
    </>
  );
}
