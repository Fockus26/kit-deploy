"use client";

import {
  type ColumnDef,
  createColumnHelper,
  type RowData,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Only the core model: sorting and paging are not in v1 (the pages show a handful of rows).
const features = tableFeatures({});

export type DataTableColumn<T extends RowData> = ColumnDef<typeof features, T>;

/** `const col = dataTableColumns<Row>(); col.accessor("name", { header: "Nombre" })` */
export function dataTableColumns<T extends RowData>() {
  return createColumnHelper<typeof features, T>();
}

/**
 * HANDOFF §2 · DataTable on TanStack Table: a real `<table>` inside a card that scrolls on its
 * own (`overflow-x: auto`) with its own `minWidth` (560–760). Column definitions must be stable
 * (module scope). An action column's header is sr-only text ("Acciones").
 *
 * Cells never wrap (`whitespace-nowrap`): status chips, SHAs, dates and `••••` stay whole and the
 * card scrolls instead. Only the column ids in `wrapColumns` (free text: domain, detail, error)
 * may break anywhere, with a floor width so they never collapse to one letter per line.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  caption,
  captionVisible = false,
  minWidth,
  wrapColumns,
  empty,
  getRowId,
  selectedRowId,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  caption: string;
  /** Show the caption as a visible title instead of sr-only. */
  captionVisible?: boolean;
  /** px; the table scrolls inside its box below this width. */
  minWidth: number;
  /** Ids of the free-text columns whose cells may wrap; every other cell stays on one line. */
  wrapColumns?: readonly string[];
  /** An <EmptyState> shown inside the card when there are no rows. */
  empty?: React.ReactNode;
  getRowId?: (row: T) => string;
  selectedRowId?: string;
}) {
  const table = useTable({
    features,
    columns,
    data,
    ...(getRowId ? { getRowId: (row: T) => getRowId(row) } : {}),
  });
  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Focusable so the keyboard can scroll it (axe: scrollable-region-focusable). */}
      <section
        className="relative overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must take focus
        tabIndex={0}
        aria-label={caption}
      >
        <table
          className="w-full border-collapse text-left text-mono"
          style={{ minWidth }}
        >
          <caption
            className={cn(
              captionVisible
                ? "p-4 text-left font-semibold text-h2"
                : "sr-only",
            )}
          >
            {caption}
          </caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-border border-b">
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-4 py-2.5 font-medium text-eyebrow text-muted-foreground uppercase tracking-[0.08em]"
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected =
                selectedRowId !== undefined && row.id === selectedRowId;
              return (
                <tr
                  key={row.id}
                  aria-selected={
                    selectedRowId !== undefined ? selected : undefined
                  }
                  className={cn(
                    "border-border border-b last:border-b-0 hover:bg-raised",
                    selected && "bg-raised",
                  )}
                >
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-4 py-2.5 align-middle",
                        wrapColumns?.includes(cell.column.id)
                          ? "min-w-40 [overflow-wrap:anywhere]"
                          : "whitespace-nowrap",
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {rows.length === 0 && empty ? (
        <div className="flex flex-1 flex-col justify-center">{empty}</div>
      ) : null}
    </div>
  );
}
