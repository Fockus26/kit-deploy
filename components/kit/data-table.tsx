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
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  caption,
  captionVisible = false,
  minWidth,
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
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Focusable so the keyboard can scroll it (axe: scrollable-region-focusable). */}
      <section
        className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
                      className="px-4 py-2.5 align-middle [overflow-wrap:anywhere]"
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
      {rows.length === 0 && empty ? empty : null}
    </div>
  );
}
