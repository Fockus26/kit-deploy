"use client";

import { Database } from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  dataTableColumns,
} from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusBadge } from "@/components/kit/status-badge";

export type DatabaseRow = {
  name: string;
  env: "production" | "preview";
  sizeText: string;
  /** ISO time of kit-db's newest dump, null when there is none or its name is not readable. */
  backupAt: string | null;
  backup: { status: "ready" | "warning"; reason?: string };
};

const col = dataTableColumns<DatabaseRow>();

const columns: DataTableColumn<DatabaseRow>[] = col.columns([
  col.accessor("name", {
    header: "Base",
    cell: (c) => <span className="font-medium font-mono">{c.getValue()}</span>,
  }),
  col.accessor("env", {
    header: "Entorno",
    cell: (c) => (c.getValue() === "production" ? "Producción" : "Preview"),
  }),
  col.accessor("sizeText", {
    header: "Tamaño",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  col.display({
    id: "backup",
    header: "Último backup",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex flex-col items-start gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={r.backup.status === "ready" ? "ready" : "warning"}
              size="table"
            />
            {r.backupAt ? (
              <RelativeTime
                date={r.backupAt}
                className="text-muted-foreground"
              />
            ) : (
              <span className="text-muted-foreground">Sin fecha</span>
            )}
          </div>
          {r.backup.reason ? (
            <p className="max-w-prose text-caption text-muted-foreground">
              {r.backup.reason}
            </p>
          ) : null}
        </div>
      );
    },
  }),
]);

/** HANDOFF §3 · Bases de datos: no connections column in v1 (D035). */
export function DatabasesTable({
  project,
  rows,
  action,
}: {
  project: string;
  rows: DatabaseRow[];
  /** The "Crear base" form, offered inside the empty state. */
  action?: React.ReactNode;
}) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      caption={`Bases de datos de ${project}`}
      minWidth={640}
      wrapColumns={["name"]}
      getRowId={(r) => r.name}
      empty={
        <EmptyState
          level={3}
          icon={Database}
          title="Este proyecto aún no tiene bases"
          action={action}
        >
          Crea la base de producción y la de previews en kit-db. La conexión
          llega sola al contenedor en el siguiente despliegue.
        </EmptyState>
      }
    />
  );
}
