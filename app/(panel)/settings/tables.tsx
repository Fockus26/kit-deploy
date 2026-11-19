"use client";

import { History, KeyRound, Ticket } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DataTable,
  type DataTableColumn,
  dataTableColumns,
} from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusBadge } from "@/components/kit/status-badge";
import { ACCOUNT_AUDIT_PROJECT } from "@/lib/db/account-scope";
import type { TokenRow } from "@/lib/db/tokens";
import type { SettingsData } from "@/lib/panel/data";
import { type RemovedNotice, RemovePasskey } from "./passkey-controls";
import { RevokeToken } from "./token-controls";

type PasskeyRow = SettingsData["passkeys"][number];
type AuditRow = SettingsData["audit"][number];

// ── Passkeys ──

const pk = dataTableColumns<PasskeyRow>();
const passkeyColumns: DataTableColumn<PasskeyRow>[] = pk.columns([
  pk.accessor("name", {
    header: "Nombre",
    cell: (c) => c.getValue() ?? "Sin nombre",
  }),
  pk.accessor("deviceType", {
    header: "Tipo",
    // WebAuthn: "multiDevice" is synced by its password manager; "singleDevice" never leaves it.
    cell: (c) =>
      c.getValue() === "multiDevice" ? "Sincronizada" : "De un dispositivo",
  }),
  pk.accessor("backedUp", {
    header: "Copia",
    cell: (c) => (c.getValue() ? "Con copia" : "Sin copia"),
  }),
  pk.accessor("createdAt", {
    header: "Creada",
    cell: (c) => {
      const at = c.getValue();
      return at ? (
        <RelativeTime date={at} className="text-muted-foreground" />
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  }),
]);

/** Eliminar (D055) per row; after a removal the row is gone, so the notice above takes focus. */
export function PasskeysTable({ rows }: { rows: PasskeyRow[] }) {
  const [notice, setNotice] = useState<RemovedNotice | null>(null);
  const status = useRef<HTMLOutputElement>(null);
  const last = rows.length === 1;

  useEffect(() => {
    if (notice) status.current?.focus();
  }, [notice]);

  const columns = useMemo(
    () => [
      ...passkeyColumns,
      ...pk.columns([
        pk.display({
          id: "actions",
          header: () => <span className="sr-only">Acciones</span>,
          cell: (c) => (
            <RemovePasskey
              passkey={c.row.original}
              last={last}
              onRemoved={setNotice}
            />
          ),
        }),
      ]),
    ],
    [last],
  );

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        // PLACEHOLDER (CONTENT_CHECKLIST row 42): the notice's text is provisional.
        <output
          ref={status}
          tabIndex={-1}
          className="block text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {notice.removed
            ? `Passkey ${notice.name ? `«${notice.name}» ` : ""}eliminada. Ese dispositivo ya no puede entrar al panel.`
            : "Esa passkey ya no estaba en tu cuenta."}
        </output>
      ) : null}
      <DataTable
        columns={columns}
        data={rows}
        caption="Passkeys de tu cuenta"
        minWidth={640}
        getRowId={(r) => r.id}
        empty={
          <EmptyState level={4} icon={KeyRound} title="Aún no hay passkeys">
            Registra una con un enlace de alta (abajo).
          </EmptyState>
        }
      />
    </div>
  );
}

// ── Tokens de despliegue ──

const tk = dataTableColumns<TokenRow>();
const tokenColumns: DataTableColumn<TokenRow>[] = tk.columns([
  tk.accessor("project", {
    header: "Proyecto",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  tk.accessor("label", {
    header: "Etiqueta",
    cell: (c) =>
      c.getValue() || <span className="text-muted-foreground">—</span>,
  }),
  tk.accessor("createdAt", {
    header: "Creado",
    cell: (c) => (
      <RelativeTime date={c.getValue()} className="text-muted-foreground" />
    ),
  }),
  tk.accessor("lastUsedAt", {
    header: "Último uso",
    cell: (c) => {
      const at = c.getValue();
      return at ? (
        <RelativeTime date={at} className="text-muted-foreground" />
      ) : (
        <span className="text-muted-foreground">Nunca</span>
      );
    },
  }),
  tk.accessor("revokedAt", {
    header: "Estado",
    cell: (c) => {
      const at = c.getValue();
      return at ? (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <StatusBadge status="sleeping" size="table" label="Revocado" />
          <RelativeTime date={at} className="text-muted-foreground" />
        </span>
      ) : (
        <StatusBadge status="active" size="table" />
      );
    },
  }),
  tk.display({
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    cell: (c) =>
      c.row.original.revokedAt ? null : <RevokeToken token={c.row.original} />,
  }),
]);

export function TokensTable({ rows }: { rows: TokenRow[] }) {
  return (
    <DataTable
      columns={tokenColumns}
      data={rows}
      caption="Tokens de despliegue"
      minWidth={760}
      getRowId={(r) => r.id}
      empty={
        <EmptyState level={3} icon={Ticket} title="Aún no hay tokens">
          Cada proyecto nuevo trae el suyo; crea otro con el formulario de
          abajo.
        </EmptyState>
      }
    />
  );
}

// ── Auditoría ──

const au = dataTableColumns<AuditRow>();
const auditColumns: DataTableColumn<AuditRow>[] = au.columns([
  au.accessor("at", {
    header: "Cuándo",
    cell: (c) => (
      <RelativeTime date={c.getValue()} className="text-muted-foreground" />
    ),
  }),
  au.accessor("actor", { header: "Quién" }),
  au.accessor("action", {
    header: "Qué",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  au.accessor("project", {
    header: "Proyecto",
    // A row about the account (a passkey removed, D055) has no project.
    cell: (c) =>
      c.getValue() === ACCOUNT_AUDIT_PROJECT ? (
        <span className="text-muted-foreground">Cuenta</span>
      ) : (
        <span className="font-mono">{c.getValue()}</span>
      ),
  }),
  au.display({
    id: "detail",
    header: "Detalle",
    // Names only (an environment, a variable or host): the log never holds a value.
    cell: (c) => {
      const { environment, name } = c.row.original;
      const parts = [environment, name].filter(Boolean);
      return parts.length > 0 ? (
        <span className="font-mono">{parts.join(" · ")}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  }),
]);

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <DataTable
      columns={auditColumns}
      data={rows}
      caption="Registro de auditoría"
      minWidth={760}
      getRowId={(r) => r.id}
      empty={
        <EmptyState level={3} icon={History} title="Aún no hay registros">
          Cada cambio hecho desde el panel o la CLI queda anotado aquí.
        </EmptyState>
      }
    />
  );
}
