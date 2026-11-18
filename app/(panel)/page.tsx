import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Meter } from "@/components/kit/meter";
import { Notice } from "@/components/kit/notice";
import { RelativeTime } from "@/components/kit/relative-time";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { NEW_PROJECT_PATH } from "@/components/layout/sidebar-nav";
import { ProjectsTable } from "@/components/panel/projects-table";
import { Section } from "@/components/panel/section";
import { buttonVariants } from "@/components/ui/button";
import { formatBytes, formatNumber } from "@/lib/kit/panel-format";
import { homeData } from "@/lib/panel/data";

export const metadata = { title: "Inicio" };

const NEW_PROJECT = (
  <Link href={NEW_PROJECT_PATH} className={buttonVariants()}>
    <Plus aria-hidden="true" />
    Nuevo proyecto
  </Link>
);

/** HANDOFF §3 Inicio: header, Estado del servidor, Alertas abiertas and the projects table. */
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-8">
          <h1 className="font-semibold text-foreground text-h1">Inicio</h1>
          <SkeletonCard title="Estado del servidor" rows={2} />
          <SkeletonCard title="Proyectos" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const { projects, lastDeployAt, vps, alerts } = await homeData();
  const count =
    projects.length === 1 ? "1 proyecto" : `${projects.length} proyectos`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="font-semibold text-foreground text-h1">Inicio</h1>
          <p className="mt-1 text-muted-foreground">
            {count}
            {lastDeployAt ? (
              <>
                {" "}
                · último despliegue <RelativeTime date={lastDeployAt} />
              </>
            ) : null}
          </p>
        </div>
        {NEW_PROJECT}
      </header>

      <Section title="Estado del servidor">
        {vps ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {vps.memUsed !== null && vps.memTotal ? (
              <Meter
                label="Memoria"
                value={vps.memUsed}
                max={vps.memTotal}
                valueText={formatBytes(vps.memUsed)}
                maxText={`de ${formatBytes(vps.memTotal)}`}
              />
            ) : null}
            {vps.diskUsed !== null && vps.diskTotal ? (
              <Meter
                label="Disco"
                value={vps.diskUsed}
                max={vps.diskTotal}
                valueText={formatBytes(vps.diskUsed)}
                maxText={`de ${formatBytes(vps.diskTotal)}`}
              />
            ) : null}
            {vps.load1 !== null && vps.cpus ? (
              <Meter
                label="Carga"
                value={vps.load1}
                max={vps.cpus}
                valueText={formatNumber(vps.load1)}
                maxText={`de ${vps.cpus} núcleos`}
                note="promedio de 1 min"
              />
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-card p-4 text-muted-foreground">
            El servidor aún no ha enviado lecturas: se toman cada minuto.
          </p>
        )}
      </Section>

      <Section
        title="Alertas abiertas"
        aside={<span className="font-mono">{alerts.length}</span>}
      >
        {alerts.length === 0 ? (
          <p className="text-muted-foreground">Sin alertas abiertas</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {alerts.map((a) => (
              <li key={a.id}>
                <Notice
                  tone="warning"
                  title={a.title}
                  actions={
                    a.project ? (
                      <Link
                        href={`/p/${a.project}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Ver proyecto
                      </Link>
                    ) : null
                  }
                >
                  <p className="text-muted-foreground">
                    {a.kindLabel} · abierta <RelativeTime date={a.openedAt} />
                    {a.detail ? ` · ${a.detail}` : ""}
                  </p>
                </Notice>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Proyectos">
        <ProjectsTable projects={projects} newProjectHref={NEW_PROJECT_PATH} />
      </Section>
    </div>
  );
}
