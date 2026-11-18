import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import type { LogLine } from "@/components/kit/log-viewer";
import { MetricCard } from "@/components/kit/metric-card";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { AgentDown } from "@/components/panel/agent-down";
import { AutoRefresh } from "@/components/panel/auto-refresh";
import { DeploymentsTable } from "@/components/panel/deployments-table";
import { LiveLogs } from "@/components/panel/live-logs";
import { PreviewCards } from "@/components/panel/preview-cards";
import { Section } from "@/components/panel/section";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatBytes,
  formatCount,
  formatNumber,
  logTime,
  seriesSummary,
} from "@/lib/kit/panel-format";
import { isUnavailable, logsTail, projectOverview } from "@/lib/panel/data";

export const metadata = { title: "Resumen" };

const LOG_LINES = 20;
const REFRESH_SECONDS = 30;
const LINK =
  "text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/** HANDOFF §3: Métricas, Despliegues recientes + Previews activos, Logs en vivo. */
export default function ProjectSummary({ params }: PageProps<"/p/[project]">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-8">
          <SkeletonCard title="Métricas" rows={2} />
          <SkeletonCard title="Despliegues recientes" />
          <SkeletonCard title="Logs en vivo" rows={2} />
        </div>
      }
    >
      <Summary params={params} />
    </Suspense>
  );
}

async function Summary({
  params,
}: {
  params: PageProps<"/p/[project]">["params"];
}) {
  const { project: name } = await params;
  const overview = await projectOverview(name);
  if (!overview) notFound();
  const { metrics, recent, previews, project, live } = overview;
  const production = metrics.totals.find((t) => t.env === "production");
  const now = metrics.containers;
  const sum = (pick: (c: (typeof now)[number]) => number | null) =>
    now.length === 0 || now.every((c) => pick(c) === null)
      ? null
      : now.reduce((a, c) => a + (pick(c) ?? 0), 0);
  const cpu = sum((c) => c.cpuPct);
  const mem = sum((c) => c.memBytes);
  const limit = sum((c) => c.memLimitBytes);
  const series = metrics.series;
  const cpuSeries = series.map((p) => p.cpuPct ?? 0);
  const memSeries = series.map((p) => (p.memBytes ?? 0) / (1024 * 1024));
  const reqSeries = series.map((p) => p.requests);
  const errSeries = series.map((p) => p.requests5xx);
  const errors = production?.requests5xx ?? 0;
  const detailBase = `/p/${project.name}/deployments`;

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh seconds={REFRESH_SECONDS} />
      <Section
        title="Métricas"
        aside={`últimas 24 h · se actualiza cada ${REFRESH_SECONDS} s`}
      >
        {series.length === 0 && now.length === 0 ? (
          <div className="rounded-lg border border-border bg-card">
            <EmptyState icon={BarChart3} title="Aún no hay métricas">
              Se toman cada minuto mientras haya algo en vivo en producción.
            </EmptyState>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            <MetricCard
              label="CPU"
              value={cpu === null ? "—" : formatNumber(cpu)}
              unit="%"
              series={cpuSeries}
              seriesLabel={seriesSummary("CPU", cpuSeries, " %")}
            />
            <MetricCard
              label="Memoria"
              value={mem === null ? "—" : formatBytes(mem)}
              unit={limit ? `de ${formatBytes(limit)}` : undefined}
              series={memSeries}
              seriesLabel={seriesSummary("Memoria", memSeries, " MB")}
            />
            <MetricCard
              label="Peticiones"
              value={formatCount(production?.requests ?? 0)}
              unit="en 24 h"
              series={reqSeries}
              seriesLabel={seriesSummary(
                "Peticiones por minuto",
                reqSeries,
                "",
              )}
            />
            <MetricCard
              label="Errores 5xx"
              value={formatCount(errors)}
              unit="en 24 h"
              series={errSeries}
              seriesLabel={seriesSummary("Errores 5xx", errSeries, "")}
              alert={errors > 0}
            />
          </div>
        )}
      </Section>

      <div className="flex flex-wrap gap-6">
        <Section
          title="Despliegues recientes"
          className="min-w-0 flex-[3_1_520px]"
          aside={
            <Link href={detailBase} className={LINK}>
              Ver todos
            </Link>
          }
        >
          <DeploymentsTable
            project={project.name}
            items={recent}
            liveSha={live?.shortSha ?? null}
            detailBase={detailBase}
            branch={project.productionBranch}
            compact
          />
        </Section>
        <Section
          title="Previews activos"
          className="min-w-0 flex-[2_1_320px]"
          aside={
            <span className="font-mono">
              {previews.running} de {previews.limit} encendidos
            </span>
          }
        >
          <PreviewCards previews={previews.previews} />
        </Section>
      </div>

      <Section
        title="Logs en vivo"
        aside={
          <Link href={`/p/${project.name}/logs`} className={LINK}>
            Ver todos
          </Link>
        }
      >
        <Suspense
          fallback={
            <div aria-busy="true" className="flex flex-col gap-3">
              <p className="text-muted-foreground">Cargando logs…</p>
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          }
        >
          <LogsBox project={project.name} />
        </Suspense>
      </Section>
    </div>
  );
}

/** Its own boundary: kit-agent may take up to its timeout, and the rest of the page does not wait. */
async function LogsBox({ project }: { project: string }) {
  const tail = await logsTail(project, "production", undefined, LOG_LINES);
  if (isUnavailable(tail)) return <AgentDown />;
  const initial: LogLine[] = tail.entries.map((e) => ({
    time: logTime(e.ts),
    level: e.level,
    text: e.line,
  }));
  return <LiveLogs project={project} initial={initial} lines={LOG_LINES} />;
}
