"use client";

import { Rocket } from "lucide-react";
import Link from "next/link";
import { createContext, useContext } from "react";
import {
  DataTable,
  type DataTableColumn,
  dataTableColumns,
} from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusBadge } from "@/components/kit/status-badge";
import { deploymentBadge, formatDuration } from "@/lib/kit/panel-format";
import type { DeploymentItem } from "@/lib/panel/data";
import { RollbackButton } from "./rollback-button";

export type DeploymentsTableProps = {
  project: string;
  items: DeploymentItem[];
  /** The SHA serving production now: "Rollback a este" names it as the origin. */
  liveSha: string | null;
  /** Where a row's detail opens: this path (with its filters) plus `d=<id>`. */
  detailBase: string;
  selectedId?: string;
  /** Resumen: fewer columns, and cards below 768 (HANDOFF §3). */
  compact?: boolean;
  /** Names the branch in the empty state ("llega con el siguiente push a main"). */
  branch: string;
};

type Ctx = {
  project: string;
  liveSha: string | null;
  detailHref: (id: string) => string;
};

/** The columns live at module scope (a stable definition); the page's context comes through here. */
const TableContext = createContext<Ctx>({
  project: "",
  liveSha: null,
  detailHref: () => "#",
});

export function detailHrefOf(base: string, id: string): string {
  return `${base}${base.includes("?") ? "&" : "?"}d=${encodeURIComponent(id)}`;
}

function environmentLabel(d: DeploymentItem): string {
  return d.environment === "preview" ? `Preview #${d.pr}` : "Producción";
}

function RowActions({ d }: { d: DeploymentItem }) {
  const ctx = useContext(TableContext);
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      <Link
        href={ctx.detailHref(d.id)}
        scroll={false}
        className="inline-flex min-h-8 items-center px-1 text-caption text-primary-text underline-offset-4 hover:underline"
      >
        Detalle<span className="sr-only"> de {d.shortSha}</span>
      </Link>
      {d.rollbackable ? (
        <RollbackButton
          project={ctx.project}
          fromSha={ctx.liveSha}
          to={{ id: d.id, sha: d.shortSha }}
          label="Rollback a este"
          size="sm"
        />
      ) : null}
    </div>
  );
}

function CommitLink({ d }: { d: DeploymentItem }) {
  const ctx = useContext(TableContext);
  return (
    <Link
      href={ctx.detailHref(d.id)}
      scroll={false}
      className="font-mono text-primary-text underline-offset-4 hover:underline"
    >
      {d.shortSha}
    </Link>
  );
}

const col = dataTableColumns<DeploymentItem>();
const status = col.display({
  id: "status",
  header: "Estado",
  cell: ({ row }) => (
    <StatusBadge
      size="table"
      {...deploymentBadge(row.original.status, row.original.environment)}
    />
  ),
});
const environment = col.display({
  id: "environment",
  header: "Entorno",
  cell: ({ row }) => environmentLabel(row.original),
});
const commit = col.display({
  id: "commit",
  header: "Commit",
  cell: ({ row }) => <CommitLink d={row.original} />,
});
const when = col.display({
  id: "when",
  header: "Cuándo",
  cell: ({ row }) => (
    <RelativeTime
      date={row.original.createdAt}
      className="text-muted-foreground"
    />
  ),
});
const duration = col.display({
  id: "duration",
  header: "Duración",
  cell: ({ row }) => (
    <span className="font-mono">{formatDuration(row.original.durationS)}</span>
  ),
});
const actions = col.display({
  id: "actions",
  header: () => <span className="sr-only">Acciones</span>,
  cell: ({ row }) => <RowActions d={row.original} />,
});
const COMPACT: DataTableColumn<DeploymentItem>[] = col.columns([
  status,
  commit,
  when,
  duration,
  actions,
]);
const FULL: DataTableColumn<DeploymentItem>[] = col.columns([
  status,
  environment,
  commit,
  when,
  duration,
  actions,
]);

/**
 * Despliegues recientes (Resumen, `compact`) and the full Despliegues table. Commit message and
 * author are not stored (CONTENT_CHECKLIST row 22): only the SHA shows. Compact: below 768 the
 * rows become cards, the only table that does (HANDOFF §8); the full one scrolls in its box.
 */
export function DeploymentsTable({
  project,
  items,
  liveSha,
  detailBase,
  selectedId,
  compact = false,
  branch,
}: DeploymentsTableProps) {
  const detailHref = (id: string) => detailHrefOf(detailBase, id);
  const empty = (
    <EmptyState level={3} icon={Rocket} title="Aún no hay despliegues">
      El primero llega con el siguiente push a {branch}.
    </EmptyState>
  );
  const table = (
    <DataTable
      columns={compact ? COMPACT : FULL}
      data={items}
      caption={compact ? "Despliegues recientes" : "Despliegues del proyecto"}
      minWidth={compact ? 560 : 760}
      getRowId={(d) => d.id}
      selectedRowId={selectedId}
      empty={empty}
    />
  );
  if (!compact) {
    return (
      <TableContext value={{ project, liveSha, detailHref }}>
        {table}
      </TableContext>
    );
  }
  return (
    <TableContext value={{ project, liveSha, detailHref }}>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">
        {items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card">{empty}</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={detailHref(d.id)}
                    scroll={false}
                    className="font-mono text-primary-text underline-offset-4 hover:underline"
                  >
                    {d.shortSha}
                  </Link>
                  <StatusBadge
                    size="table"
                    {...deploymentBadge(d.status, d.environment)}
                  />
                </div>
                <p className="flex flex-wrap gap-x-3 text-caption text-muted-foreground">
                  <span>{environmentLabel(d)}</span>
                  <RelativeTime date={d.createdAt} />
                  <span className="font-mono">
                    {formatDuration(d.durationS)}
                  </span>
                </p>
                {d.rollbackable ? (
                  <RollbackButton
                    project={project}
                    fromSha={liveSha}
                    to={{ id: d.id, sha: d.shortSha }}
                    label="Rollback a este"
                    size="sm"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </TableContext>
  );
}
