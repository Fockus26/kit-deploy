"use client";

import { FolderPlus } from "lucide-react";
import Link from "next/link";
import {
  DataTable,
  type DataTableColumn,
  dataTableColumns,
} from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { Meter } from "@/components/kit/meter";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusBadge } from "@/components/kit/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatBytes, productionBadge } from "@/lib/kit/panel-format";
import type { HomeProject } from "@/lib/panel/data";

const col = dataTableColumns<HomeProject>();
const COLUMNS: DataTableColumn<HomeProject>[] = col.columns([
  col.display({
    id: "project",
    header: "Proyecto",
    cell: ({ row }) => (
      <Link
        href={`/p/${row.original.name}`}
        className="font-medium font-mono text-primary-text underline-offset-4 hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  }),
  col.display({
    id: "production",
    header: "Producción",
    cell: ({ row }) => (
      <StatusBadge size="table" {...productionBadge(row.original.production)} />
    ),
  }),
  col.display({
    id: "domain",
    header: "Dominio",
    cell: ({ row }) => (
      <span className="font-mono">{row.original.domain ?? "—"}</span>
    ),
  }),
  col.display({
    id: "last",
    header: "Último despliegue",
    cell: ({ row }) => {
      const last = row.original.lastDeploy;
      return last ? (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono">{last.shortSha}</span>
          <RelativeTime date={last.at} className="text-muted-foreground" />
        </span>
      ) : (
        <span className="text-muted-foreground">Ninguno</span>
      );
    },
  }),
  col.display({
    id: "memory",
    header: "Memoria",
    cell: ({ row }) => {
      const m = row.original.memory;
      return m ? (
        <Meter
          variant="row"
          label={`Memoria de ${row.original.name}`}
          value={m.usedBytes}
          max={m.limitBytes}
          valueText={formatBytes(m.usedBytes)}
          maxText={`de ${formatBytes(m.limitBytes)}`}
        />
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  }),
]);

/** HANDOFF §3 Inicio › Proyectos. Below 768 it scrolls inside its box, it never becomes cards. */
export function ProjectsTable({
  projects,
  newProjectHref,
}: {
  projects: HomeProject[];
  newProjectHref: string;
}) {
  return (
    <DataTable
      columns={COLUMNS}
      data={projects}
      caption="Proyectos"
      minWidth={760}
      getRowId={(p) => p.name}
      empty={
        <EmptyState
          icon={FolderPlus}
          title="Aún no hay proyectos"
          action={
            <Link href={newProjectHref} className={buttonVariants()}>
              Nuevo proyecto
            </Link>
          }
        >
          Crea uno con su repo de GitHub. El primer despliegue llega con el
          siguiente push a main.
        </EmptyState>
      }
    />
  );
}
