import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CreateDatabasesForm } from "@/components/databases/create-databases-form";
import {
  type DatabaseRow,
  DatabasesTable,
} from "@/components/databases/databases-table";
import { Notice } from "@/components/kit/notice";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { buttonVariants } from "@/components/ui/button";
import { backupState, failuresOf } from "@/lib/kit/logs-page";
import { databases, isUnavailable } from "@/lib/panel/data";

export const metadata = { title: "Bases de datos" };

export default function DatabasesPage({
  params,
}: PageProps<"/p/[project]/databases">) {
  return (
    <Suspense fallback={<SkeletonCard title="Bases de datos" rows={3} />}>
      <Databases params={params} />
    </Suspense>
  );
}

/** kit-db keeps two per project: `<project>` and `<project>_preview`. */
const PER_PROJECT = 2;

async function Databases({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  const data = await databases(project);
  if (data === null) notFound();

  return (
    <section aria-labelledby="bases" className="flex flex-col gap-4">
      <div>
        <h2 id="bases" className="font-semibold text-foreground text-h2">
          Bases de datos
        </h2>
        <p className="text-caption text-muted-foreground">
          Postgres central del servidor. kit-db hace un backup cada noche; la
          conexión llega sola al contenedor en cada despliegue.
        </p>
      </div>
      {isUnavailable(data) ? (
        <Notice
          tone="destructive"
          title="No se pudo hablar con kit-agent"
          actions={
            <Link
              href={`/p/${project}/databases`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Reintentar
            </Link>
          }
        >
          Los sitios siguen sirviendo: no dependen del panel.{" "}
          <code className="font-mono text-mono">
            systemctl status kit-agent
          </code>
        </Notice>
      ) : (
        <Loaded project={project} data={data} />
      )}
    </section>
  );
}

function Loaded({
  project,
  data,
}: {
  project: string;
  data: Exclude<
    Awaited<ReturnType<typeof databases>>,
    null | { unavailable: "agent" }
  >;
}) {
  const now = Date.now();
  const rows: DatabaseRow[] = data.databases.map((d) => {
    const state = backupState(
      d.lastBackup,
      failuresOf(d.name, data.failures),
      now,
    );
    return {
      name: d.name,
      env: d.env,
      sizeText: d.sizeText,
      backupAt: d.lastBackup?.at ?? null,
      backup:
        state.status === "ready"
          ? { status: "ready" }
          : { status: "warning", reason: state.reason },
    };
  });
  const missing = rows.length < PER_PROJECT;
  const create = missing ? <CreateDatabasesForm project={project} /> : null;
  return (
    <>
      <DatabasesTable
        project={project}
        rows={rows}
        action={rows.length === 0 ? create : undefined}
      />
      {rows.length > 0 && missing ? (
        <div className="flex flex-wrap items-center gap-3">
          {create}
          <p className="text-caption text-muted-foreground">
            Falta una de las dos bases del proyecto.
          </p>
        </div>
      ) : null}
      <p className="text-caption text-muted-foreground">
        {data.offVps
          ? `Copia fuera del servidor: ${data.offVps}.`
          : "Sin copia fuera del servidor: los backups solo están en el VPS."}
      </p>
    </>
  );
}
