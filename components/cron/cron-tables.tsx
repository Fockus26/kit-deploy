"use client";

import { Clock, History } from "lucide-react";
import { CommandLine } from "@/components/kit/command-line";
import {
  DataTable,
  type DataTableColumn,
  dataTableColumns,
} from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusBadge } from "@/components/kit/status-badge";

export type CronJobView = {
  id: string;
  path: string;
  schedule: string;
  enabled: boolean;
  /** ISO; null when paused or it never fires. */
  next: string | null;
};

export type CronRunView = {
  id: string;
  path: string;
  /** ISO. */
  startedAt: string;
  status: "running" | "ok" | "failed";
  httpStatus: number | null;
  durationMs: number | null;
  error: string | null;
};

/** `2026-11-19 03:00 UTC`: schedules are UTC, so the next run is shown in UTC too. */
function utc(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

function ms(n: number | null): string {
  if (n === null) return "—";
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
}

const jobCol = dataTableColumns<CronJobView>();
const jobColumns: DataTableColumn<CronJobView>[] = jobCol.columns([
  jobCol.accessor("path", {
    header: "Ruta",
    cell: (c) => <span className="font-medium font-mono">{c.getValue()}</span>,
  }),
  jobCol.accessor("schedule", {
    header: "Horario (UTC)",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  jobCol.display({
    id: "state",
    header: "Estado",
    cell: ({ row }) =>
      row.original.enabled ? (
        <StatusBadge status="active" label="Activo" size="table" />
      ) : (
        <StatusBadge status="sleeping" label="En pausa" size="table" />
      ),
  }),
  jobCol.accessor("next", {
    header: "Próxima",
    cell: (c) => {
      const v = c.getValue();
      return v ? (
        <span className="font-mono">{utc(v)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  }),
  jobCol.accessor("id", {
    header: "Id",
    cell: (c) => (
      <span className="font-mono text-muted-foreground">
        {c.getValue().slice(0, 8)}
      </span>
    ),
  }),
]);

const runCol = dataTableColumns<CronRunView>();
const runColumns: DataTableColumn<CronRunView>[] = runCol.columns([
  runCol.accessor("startedAt", {
    header: "Inicio",
    cell: (c) => <RelativeTime date={c.getValue()} />,
  }),
  runCol.accessor("path", {
    header: "Ruta",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  runCol.display({
    id: "status",
    header: "Resultado",
    cell: ({ row }) => {
      const r = row.original;
      if (r.status === "running")
        return <StatusBadge status="building" label="En curso" size="table" />;
      return r.status === "ok" ? (
        <StatusBadge status="ready" label="Correcto" size="table" />
      ) : (
        <StatusBadge status="failed" size="table" />
      );
    },
  }),
  runCol.accessor("httpStatus", {
    header: "HTTP",
    cell: (c) => <span className="font-mono">{c.getValue() ?? "—"}</span>,
  }),
  runCol.accessor("durationMs", {
    header: "Duración",
    cell: (c) => <span className="font-mono">{ms(c.getValue())}</span>,
  }),
  runCol.accessor("error", {
    header: "Detalle",
    cell: (c) => (
      <span className="block max-w-prose text-caption text-muted-foreground [overflow-wrap:anywhere]">
        {c.getValue() ?? ""}
      </span>
    ),
  }),
]);

export function CronJobsTable({
  project,
  jobs,
}: {
  project: string;
  jobs: CronJobView[];
}) {
  return (
    <DataTable
      columns={jobColumns}
      data={jobs}
      caption={`Tareas programadas de ${project}`}
      minWidth={640}
      wrapColumns={["path"]}
      getRowId={(r) => r.id}
      empty={
        <EmptyState
          level={3}
          icon={Clock}
          title="Sin tareas programadas"
          action={
            <div className="w-full max-w-xl text-left">
              <CommandLine
                command={`ssh kit-vps kit-deploy cron add ${project} /api/cron/diario "0 3 * * *"`}
              />
            </div>
          }
        >
          Una tarea llama a una ruta de producción con su CRON_SECRET según su
          horario. Se crea desde el servidor:
        </EmptyState>
      }
    />
  );
}

export function CronRunsTable({
  project,
  runs,
}: {
  project: string;
  runs: CronRunView[];
}) {
  return (
    <DataTable
      columns={runColumns}
      data={runs}
      caption={`Ejecuciones de ${project}`}
      minWidth={720}
      wrapColumns={["path", "error"]}
      getRowId={(r) => r.id}
      empty={
        <EmptyState level={3} icon={History} title="Aún no hay ejecuciones">
          Cada llamada aparece aquí con su código HTTP y su duración; se guardan
          30 días.
        </EmptyState>
      }
    />
  );
}
