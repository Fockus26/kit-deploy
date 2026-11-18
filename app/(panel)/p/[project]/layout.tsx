import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentDownNotice } from "@/components/kit/agent-down-notice";
import { StatusBadge } from "@/components/kit/status-badge";
import { ProjectTabs } from "@/components/layout/project-tabs";
import { ProjectActions } from "@/components/panel/project-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { productionBadge } from "@/lib/kit/panel-format";
import { rollbackTarget } from "@/lib/kit/rollback";
import { deployments, isUnavailable, projectOverview } from "@/lib/panel/data";

/**
 * A project's frame (HANDOFF §3 Proyecto · cabecera): its name and production status, domain,
 * branch@sha and repo, the four actions, and the tabs of its sections. `/p/<unknown>` answers its
 * 404 in proxy.ts (a `notFound()` here comes after the stream started); this one is the fallback.
 */
export default function ProjectLayout({
  params,
  children,
}: LayoutProps<"/p/[project]">) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true">
          <p className="mb-3 text-muted-foreground">Cargando el proyecto…</p>
          <Skeleton className="mb-3 h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
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
  const [overview, production] = await Promise.all([
    projectOverview(name),
    deployments(name, "production"),
  ]);
  if (!overview) notFound();

  const { project, live, container } = overview;
  const state = isUnavailable(container)
    ? "unknown"
    : !container || container.state === "running"
      ? "running"
      : "stopped";
  const badge = productionBadge(overview.production, state === "stopped");
  const target = rollbackTarget(production?.deployments ?? []);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <p className="mb-1 font-medium text-eyebrow text-muted-foreground uppercase">
            Proyecto
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="wrap-anywhere font-mono font-semibold text-foreground text-h1">
              {project.name}
            </h1>
            <StatusBadge {...badge} />
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-mono text-muted-foreground">
            <li className="wrap-anywhere">
              {overview.domain ? (
                <a
                  href={`https://${overview.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary-text underline-offset-4 hover:underline"
                >
                  {overview.domain}
                  <span className="sr-only"> (abre en otra pestaña)</span>
                </a>
              ) : (
                "Sin dominio"
              )}
            </li>
            <li className="wrap-anywhere font-mono">
              {project.productionBranch}
              {live ? `@${live.shortSha}` : ""}
            </li>
            <li className="wrap-anywhere font-mono">{project.repo}</li>
          </ul>
        </div>
        <ProjectActions
          project={project.name}
          hasLive={live !== null}
          liveSha={live?.shortSha ?? null}
          rollback={{
            available: target !== null,
            id: target?.id ?? null,
            sha: target?.sha ?? null,
          }}
          container={state}
        />
      </header>
      {isUnavailable(container) ? <AgentDownNotice className="mb-6" /> : null}
      <ProjectTabs project={project.name} />
      <div className="pt-6">{children}</div>
    </>
  );
}
