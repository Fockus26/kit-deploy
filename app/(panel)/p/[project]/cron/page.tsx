import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CronJobsTable, CronRunsTable } from "@/components/cron/cron-tables";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { cronData } from "@/lib/panel/data";

export const metadata = { title: "Cron" };

export default function CronPage({ params }: PageProps<"/p/[project]/cron">) {
  return (
    <Suspense fallback={<SkeletonCard title="Cron" rows={3} />}>
      <Cron params={params} />
    </Suspense>
  );
}

/**
 * Brief F12 (phase 06, D048, D050): the project's scheduled routes and the log of each call.
 * Read only: jobs are added, paused and removed with `kit-deploy cron` over SSH.
 */
async function Cron({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const data = await cronData(project);
  if (data === null) notFound();

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="cron" className="flex flex-col gap-4">
        <div>
          <h2 id="cron" className="font-semibold text-foreground text-h2">
            Tareas programadas
          </h2>
          <p className="text-caption text-muted-foreground">
            Cada una llama por GET a una ruta de producción con{" "}
            <code className="font-mono">Authorization: Bearer CRON_SECRET</code>
            . Horarios en UTC; se gestionan con{" "}
            <code className="font-mono">kit-deploy cron</code>.
          </p>
        </div>
        <CronJobsTable
          project={project}
          jobs={data.jobs.map((j) => ({
            id: j.id,
            path: j.path,
            schedule: j.schedule,
            enabled: j.enabled,
            next: j.next?.toISOString() ?? null,
          }))}
        />
      </section>

      <section aria-labelledby="ejecuciones" className="flex flex-col gap-4">
        <div>
          <h2
            id="ejecuciones"
            className="font-semibold text-foreground text-h2"
          >
            Ejecuciones
          </h2>
          <p className="text-caption text-muted-foreground">
            Las últimas 50, la más reciente primero. Una respuesta 2xx es
            correcta; la ruta tiene 50 segundos.
          </p>
        </div>
        <CronRunsTable
          project={project}
          runs={data.runs.map((r) => ({
            id: r.id,
            path: r.path,
            startedAt: r.startedAt.toISOString(),
            status: r.status,
            httpStatus: r.httpStatus,
            durationMs: r.durationMs,
            error: r.error,
          }))}
        />
      </section>
    </div>
  );
}
