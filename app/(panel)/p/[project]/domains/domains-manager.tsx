"use client";

import { Globe } from "lucide-react";
import {
  createContext,
  startTransition,
  use,
  useActionState,
  useState,
} from "react";
import {
  addDomainAction,
  checkDomainsAction,
  removeDomainAction,
} from "@/app/(panel)/actions/domains";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { CopyValue } from "@/components/kit/copy-value";
import {
  DataTable,
  type DataTableColumn,
  dataTableColumns,
} from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { FieldInput, FieldRadioGroup } from "@/components/kit/field";
import { Notice } from "@/components/kit/notice";
import { OptionSelect } from "@/components/kit/option-select";
import { RelativeTime } from "@/components/kit/relative-time";
import { StatusBadge } from "@/components/kit/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { DomainRedirect } from "@/lib/db/schema";
import type { DnsInstructions, DnsRecord } from "@/lib/domains/dns";
import type { DomainItem } from "@/lib/panel/data";
import { DOMAIN_BADGE, REDIRECT_OPTIONS } from "@/lib/panel/resource-labels";
import { MAX } from "@/lib/panel/schemas";
import { ActionFailureNotice } from "../_parts/action-notice";

export type DomainRow = DomainItem & { certLabel: string };

const CERT_TONE: Record<DomainRow["certTone"], string> = {
  ok: "text-foreground",
  soon: "text-warning",
  error: "text-destructive",
  none: "text-muted-foreground",
};

/** The row actions need the page's state; the column definitions stay at module scope. */
const RemoveContext = createContext<{
  project: string;
  removing: string | null;
  remove: (row: DomainRow) => void;
} | null>(null);

function RemoveButton({ row }: { row: DomainRow }) {
  const ctx = use(RemoveContext);
  if (!ctx) return null;
  const { project, removing, remove } = ctx;
  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="destructive-text"
          size="sm"
          loading={removing === row.host}
          aria-label={`Quitar ${row.host}`}
        >
          Quitar
        </Button>
      }
      title={`Quitar ${row.host} de ${project}`}
      description={
        row.isDefault ? (
          <p>
            Es el dominio por defecto del proyecto. Deja de servir el sitio en
            cuanto se quite; solo se puede si otro dominio ya apunta al
            servidor.
          </p>
        ) : (
          <p>
            Deja de servir el sitio y su certificado se descarta. Para volver a
            usarlo habrá que añadirlo otra vez.
          </p>
        )
      }
      confirmLabel="Quitar dominio"
      confirmName={row.host}
      onConfirm={() => remove(row)}
    />
  );
}

const col = dataTableColumns<DomainRow>();
const columns: DataTableColumn<DomainRow>[] = col.columns([
  col.accessor("host", {
    header: "Dominio",
    cell: (c) => (
      <span className="font-mono font-medium text-foreground">
        {c.getValue()}
        {c.row.original.isDefault ? (
          <span className="font-sans font-normal text-muted-foreground">
            {" "}
            · por defecto
          </span>
        ) : null}
      </span>
    ),
  }),
  col.accessor("status", {
    header: "Estado",
    cell: (c) => (
      <StatusBadge status={DOMAIN_BADGE[c.getValue()]} size="table" />
    ),
  }),
  col.accessor("certLabel", {
    header: "Certificado",
    cell: (c) => {
      const row = c.row.original;
      return (
        <span className={CERT_TONE[row.certTone]}>
          {c.getValue()}
          {row.certTone === "error" && row.lastError ? (
            <span className="block text-caption">{row.lastError}</span>
          ) : null}
        </span>
      );
    },
  }),
  col.accessor("redirectsTo", {
    header: "Redirección",
    cell: (c) => {
      const to = c.getValue();
      return to ? (
        <span className="font-mono text-caption">
          <span aria-hidden="true">→ </span>
          <span className="sr-only">Redirige a </span>
          {to}
        </span>
      ) : (
        <span className="text-caption text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">Sin redirección</span>
        </span>
      );
    },
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    cell: (c) => <RemoveButton row={c.row.original} />,
  }),
]);

type DnsRow = DnsRecord & { id: string };
const dnsCol = dataTableColumns<DnsRow>();
const dnsColumns: DataTableColumn<DnsRow>[] = dnsCol.columns([
  dnsCol.accessor("type", {
    header: "Tipo",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  dnsCol.accessor("name", {
    header: "Nombre",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  dnsCol.accessor("value", {
    header: "Valor",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  dnsCol.display({
    id: "copy",
    header: () => <span className="sr-only">Copiar</span>,
    cell: (c) => <CopyValue value={c.row.original.value} />,
  }),
]);

export function DomainsManager({
  project,
  domains,
  lastCheckedAt,
}: {
  project: string;
  domains: DomainRow[];
  lastCheckedAt: Date | null;
}) {
  const [addState, addAction, adding] = useActionState(addDomainAction, null);
  const [removeState, removeAction, removePending] = useActionState(
    removeDomainAction,
    null,
  );
  const [checkState, checkAction, checking] = useActionState(
    checkDomainsAction,
    null,
  );
  const [removing, setRemoving] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<DomainRedirect>("none");
  const [lastHost, setLastHost] = useState("");
  // The host whose records are shown: the one picked, else the last one added, else the first
  // one still waiting for its DNS, else the first.
  const [picked, setPicked] = useState<string | null>(null);

  const hosts = domains.map((d) => d.host);
  const added = addState?.ok ? addState.host : null;
  const fallback =
    domains.find((d) => !d.isDefault && d.status === "pending_dns")?.host ??
    domains.find((d) => !d.isDefault)?.host ??
    hosts[0] ??
    null;
  const shown =
    [picked, added, fallback].find(
      (h): h is string => h !== null && hosts.includes(h),
    ) ?? added;
  const shownDns: DnsInstructions | null =
    domains.find((d) => d.host === shown)?.dns ??
    (addState?.ok && addState.host === shown ? addState.dns : null);

  function remove(row: DomainRow) {
    const form = new FormData();
    form.set("project", project);
    form.set("host", row.host);
    form.set("confirm", row.host);
    // The dialog's typed host is the explicit "yes, the default one too" (`domain rm --force`).
    if (row.isDefault) form.set("force", "on");
    setRemoving(row.host);
    startTransition(() => removeAction(form));
  }

  const removeFailure = removeState && !removeState.ok ? removeState : null;

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-label="Dominios del proyecto"
        className="flex flex-col gap-3"
      >
        {removeFailure ? (
          <ActionFailureNotice
            failure={removeFailure}
            title="No se pudo quitar el dominio"
          />
        ) : removeState?.ok && !removePending ? (
          <Notice
            tone="info"
            title={`${removeState.host} ya no es de ${project}`}
          >
            {removeState.site === "rewritten"
              ? "El sitio en vivo ya no lo sirve."
              : "El próximo despliegue lo deja de servir."}
          </Notice>
        ) : null}
        <RemoveContext
          value={{ project, removing: removePending ? removing : null, remove }}
        >
          <DataTable
            columns={columns}
            data={domains}
            caption={`Dominios de ${project}`}
            minWidth={720}
            getRowId={(r) => r.host}
            empty={
              <EmptyState level={3} icon={Globe} title="Sin dominios">
                Añade el primero con el formulario de abajo.
              </EmptyState>
            }
          />
        </RemoveContext>
      </section>

      <div className="flex flex-wrap gap-6">
        <section
          aria-labelledby="anadir-dominio"
          className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 self-start rounded-lg border border-border bg-card p-5"
        >
          <h2
            id="anadir-dominio"
            className="font-semibold text-foreground text-h2"
          >
            Añadir dominio
          </h2>
          {addState && !addState.ok && !addState.fields?.host ? (
            <ActionFailureNotice
              failure={addState}
              title="No se pudo añadir el dominio"
            />
          ) : addState?.ok && !adding ? (
            <Notice
              tone="info"
              title={
                addState.already
                  ? `${addState.host} ya estaba en ${project}`
                  : `${addState.host} añadido`
              }
            >
              Crea sus registros DNS: el chequeo de cada minuto lo pone en
              marcha en cuanto apunte al servidor.
            </Notice>
          ) : null}
          <form
            method="post"
            action={(form) => {
              setLastHost(String(form.get("host") ?? ""));
              setPicked(null);
              addAction(form);
            }}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="project" value={project} />
            <FieldInput
              label="Dominio"
              name="host"
              defaultValue={addState && !addState.ok ? lastHost : ""}
              placeholder="tienda.com"
              help="Sin https:// ni barra final."
              error={
                addState && !addState.ok ? addState.fields?.host : undefined
              }
              required
              maxLength={MAX.host}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="url"
              className="[&_input]:font-mono"
            />
            <FieldRadioGroup
              legend="Qué hace este dominio"
              name="redirect"
              value={redirect}
              onValueChange={(v) => setRedirect(v as DomainRedirect)}
              options={REDIRECT_OPTIONS}
              help="La redirección necesita que el otro dominio ya sea del proyecto."
              error={
                addState && !addState.ok ? addState.fields?.redirect : undefined
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={adding}>
                Añadir
              </Button>
            </div>
          </form>
        </section>

        <section
          aria-labelledby="registros-dns"
          className="flex min-w-0 flex-[2_1_520px] flex-col gap-4 self-start rounded-lg border border-border bg-card p-5"
        >
          <h2
            id="registros-dns"
            className="font-semibold text-foreground text-h2 [overflow-wrap:anywhere]"
          >
            {shown ? (
              <>
                Registros DNS para <span className="font-mono">{shown}</span>
              </>
            ) : (
              "Registros DNS"
            )}
          </h2>
          {hosts.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dns-host">Ver los registros de</Label>
              <OptionSelect
                id="dns-host"
                value={shown ?? undefined}
                onValueChange={setPicked}
                options={hosts.map((h) => ({ value: h, label: h }))}
                className="max-w-md font-mono"
              />
            </div>
          ) : null}
          {shownDns ? (
            <DnsRecords dns={shownDns} />
          ) : (
            <p className="text-muted-foreground">
              Añade un dominio para ver qué registros crear.
            </p>
          )}

          {checkState && !checkState.ok ? (
            <ActionFailureNotice
              failure={checkState}
              title="No se pudo comprobar"
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form method="post" action={checkAction}>
              <input type="hidden" name="project" value={project} />
              <Button type="submit" variant="outline" loading={checking}>
                Comprobar ahora
              </Button>
            </form>
            {/* Always mounted: the check's summary replaces the date and is announced. */}
            <output className="text-caption text-muted-foreground">
              {checkState?.ok && !checking ? (
                checkSummary(checkState)
              ) : lastCheckedAt ? (
                <>
                  Última comprobación <RelativeTime date={lastCheckedAt} />
                </>
              ) : (
                "Aún sin comprobar"
              )}
            </output>
          </div>
        </section>
      </div>
    </div>
  );
}

function checkSummary(r: {
  checked: number;
  changed: unknown[];
  failed: number;
}) {
  const checked =
    r.checked === 1
      ? "Se comprobó 1 dominio"
      : `Se comprobaron ${r.checked} dominios`;
  const changed =
    r.changed.length === 0
      ? "ninguno cambió de estado"
      : r.changed.length === 1
        ? "1 cambió de estado"
        : `${r.changed.length} cambiaron de estado`;
  const failed = r.failed > 0 ? `; ${r.failed} no se pudieron comprobar` : "";
  return `${checked}: ${changed}${failed}.`;
}

function DnsRecords({ dns }: { dns: DnsInstructions }) {
  if (dns.coveredBy)
    return (
      <p className="text-muted-foreground">
        Nada que crear: <span className="font-mono">{dns.coveredBy}</span> ya
        apunta al servidor.
      </p>
    );
  const rows: DnsRow[] = dns.records.map((r) => ({
    ...r,
    id: `${r.type}-${r.name}`,
  }));
  return (
    <>
      <p className="text-muted-foreground">
        En el proveedor de DNS de <span className="font-mono">{dns.zone}</span>,
        crea estos registros. En Cloudflare, con la nube gris (solo DNS): el
        proxy respondería con sus propias direcciones.
      </p>
      <DataTable
        columns={dnsColumns}
        data={rows}
        caption={`Registros DNS para ${dns.host}`}
        minWidth={520}
        getRowId={(r) => r.id}
      />
      {dns.mustNotExist.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          Si ya hay un registro {dns.mustNotExist.join(", ")} para{" "}
          <span className="font-mono">{dns.records[0]?.name ?? dns.host}</span>,
          bórralo: uno que no sea del servidor impide emitir el certificado.
        </p>
      ) : null}
    </>
  );
}
