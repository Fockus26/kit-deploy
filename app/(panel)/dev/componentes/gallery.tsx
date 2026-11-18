"use client";

import { FolderPlus, Rocket } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { CopyValue } from "@/components/kit/copy-value";
import {
  DataTable,
  type DataTableColumn,
  dataTableColumns,
} from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import {
  FieldCheckbox,
  FieldInput,
  FieldRadioGroup,
  FieldTextarea,
} from "@/components/kit/field";
import { type LogLine, LogViewer } from "@/components/kit/log-viewer";
import { Meter } from "@/components/kit/meter";
import { MetricCard } from "@/components/kit/metric-card";
import { Notice } from "@/components/kit/notice";
import { RelativeTime } from "@/components/kit/relative-time";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { type Status, StatusBadge } from "@/components/kit/status-badge";
import { StatusDot } from "@/components/kit/status-dot";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Fixed clock so screenshots do not move.
const NOW = new Date("2026-11-17T15:00:00");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

type Deploy = { sha: string; status: Status; at: Date };
const col = dataTableColumns<Deploy>();
const columns: DataTableColumn<Deploy>[] = col.columns([
  col.accessor("sha", {
    header: "Commit",
    cell: (c) => <span className="font-mono">{c.getValue()}</span>,
  }),
  col.accessor("status", {
    header: "Estado",
    cell: (c) => <StatusBadge status={c.getValue()} size="table" />,
  }),
  col.accessor("at", {
    header: "Cuándo",
    cell: (c) => (
      <RelativeTime
        date={c.getValue()}
        now={NOW}
        className="text-muted-foreground"
      />
    ),
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Acciones</span>,
    cell: () => (
      <Button variant="outline" size="sm">
        Rollback
      </Button>
    ),
  }),
]);
const deploys: Deploy[] = [
  { sha: "a1b2c3d", status: "active", at: minutesAgo(14) },
  { sha: "9f8e7d6", status: "building", at: minutesAgo(2) },
  { sha: "5c4b3a2", status: "failed", at: minutesAgo(60 * 26) },
  { sha: "1d2e3f4", status: "sleeping", at: minutesAgo(60 * 24 * 3) },
];

const STATUSES: Status[] = [
  "active",
  "ready",
  "building",
  "sleeping",
  "saved",
  "failed",
  "error",
  "verifying",
  "issuing",
  "warning",
];

const LINES: LogLine[] = [
  { time: "14:02:11", level: "info", text: "GET /api/health 200 3ms" },
  {
    time: "14:02:14",
    level: "warn",
    text: "slow query: SELECT * FROM events (812ms)",
  },
  {
    time: "14:02:19",
    level: "error",
    text: "TypeError: Cannot read properties of undefined (reading 'id')",
  },
  { time: "14:02:22", level: "info", text: "GET / 200 41ms" },
  ...Array.from(
    { length: 24 },
    (_, i): LogLine => ({
      time: `14:03:${String(i).padStart(2, "0")}`,
      level: "info",
      text: `GET /pagina/${i} 200 ${10 + i}ms`,
    }),
  ),
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-h2">{title}</h2>
      {children}
    </section>
  );
}

export function Gallery() {
  const [following, setFollowing] = useState(true);
  const [confirmed, setConfirmed] = useState("ninguna");
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-semibold text-h1">Componentes</h1>

      <Section title="Button">
        <div className="flex flex-wrap gap-2">
          <Button>Redeploy</Button>
          <Button variant="outline">Cancelar</Button>
          <Button variant="destructive-text">Parar</Button>
          <Button variant="destructive-solid">Parar producción</Button>
          <Button variant="ghost">Ver logs</Button>
          <Button disabled>Deshabilitado</Button>
          <Button loading={loading} onClick={() => setLoading((v) => !v)}>
            <Rocket aria-hidden="true" />
            {loading ? "Desplegando…" : "Desplegar"}
          </Button>
          <Button size="sm" variant="outline">
            Compacto
          </Button>
        </div>
      </Section>

      <Section title="StatusBadge y StatusDot">
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-body">
          <span className="inline-flex items-center gap-2">
            <StatusDot tone="success" />{" "}
            <span className="font-mono">maranatha</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <StatusDot tone="destructive" />{" "}
            <span className="font-mono">kd_hello</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <StatusDot /> <span className="font-mono">landing</span>
          </span>
        </div>
      </Section>

      <Section title="CopyValue y RelativeTime">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-mono">192.0.2.10</span>
          <CopyValue value="192.0.2.10" />
          <RelativeTime date={minutesAgo(14)} now={NOW} />
          <RelativeTime date={minutesAgo(60 * 26)} now={NOW} />
          <RelativeTime date={minutesAgo(60 * 24 * 3)} now={NOW} />
        </div>
      </Section>

      <Section title="Meter">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meter
            label="Memoria"
            value={3.1}
            max={8}
            valueText="3,1 GB"
            maxText="de 8 GB"
            note="Sitios y servicios"
          />
          <Meter
            label="Disco"
            value={88}
            max={100}
            valueText="88 GB"
            maxText="de 100 GB"
          />
          <Meter
            label="CPU"
            value={97}
            max={100}
            valueText="97 %"
            maxText="de 100 %"
          />
          <Meter
            label="Bases"
            value={20}
            max={100}
            valueText="20 GB"
            maxText="de 100 GB"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Meter
            variant="row"
            label="Memoria de maranatha"
            value={40}
            max={100}
            valueText="40 %"
          />
          <Meter
            variant="row"
            label="Disco de landing"
            value={90}
            max={100}
            valueText="90 %"
          />
          <Meter
            variant="row"
            label="Disco de kd_hello"
            value={96}
            max={100}
            valueText="96 %"
          />
        </div>
      </Section>

      <Section title="MetricCard y Sparkline">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Peticiones"
            value="1.284"
            unit="/ h"
            series={[4, 8, 6, 12, 9, 14, 11, 16]}
            seriesLabel="Peticiones por hora, en aumento"
          />
          <MetricCard
            label="Errores 5xx"
            value="3"
            series={[0, 0, 1, 0, 0, 1, 0, 1]}
            seriesLabel="Tres errores 5xx aislados"
            alert
          />
          <MetricCard
            label="Latencia p95"
            value="212"
            unit="ms"
            series={[200, 210, 190, 230, 205, 212, 208, 212]}
            seriesLabel="Latencia estable alrededor de 210 ms"
          />
        </div>
      </Section>

      <Section title="DataTable">
        <DataTable
          columns={columns}
          data={deploys}
          caption="Despliegues de maranatha"
          minWidth={560}
          getRowId={(r) => r.sha}
          selectedRowId="a1b2c3d"
        />
        <DataTable
          columns={columns}
          data={[]}
          caption="Despliegues vacíos"
          minWidth={560}
          empty={
            <EmptyState icon={Rocket} title="Aún no hay despliegues">
              El primer despliegue llega con el siguiente push a main.
            </EmptyState>
          }
        />
      </Section>

      <Section title="ConfirmDialog">
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmDialog
            trigger={<Button>Hacer rollback</Button>}
            title="Rollback de maranatha a 5c4b3a2"
            description={
              <p>
                <span className="font-mono">a1b2c3d</span> →{" "}
                <span className="font-mono">5c4b3a2</span>, publicado hace 1
                día.
              </p>
            }
            confirmLabel="Hacer rollback"
            onConfirm={() => setConfirmed("rollback")}
          />
          <ConfirmDialog
            trigger={
              <Button variant="destructive-text">Parar producción</Button>
            }
            title="Parar producción de maranatha"
            description="El sitio dejará de responder hasta el próximo despliegue."
            confirmLabel="Parar producción"
            confirmName="maranatha"
            onConfirm={() => setConfirmed("parar")}
          />
          <output className="text-caption text-muted-foreground">
            Última confirmación: {confirmed}
          </output>
        </div>
      </Section>

      <Section title="LogViewer">
        <LogViewer
          lines={LINES}
          following={following}
          onTogglePause={() => setFollowing((v) => !v)}
          label="Logs de maranatha (producción)"
          className="max-h-60"
        />
      </Section>

      <Section title="Tabs de entorno">
        <Tabs defaultValue="production">
          <TabsList aria-label="Entorno">
            <TabsTrigger value="production">
              Producción{" "}
              <span className="font-mono text-caption text-muted-foreground">
                12
              </span>
            </TabsTrigger>
            <TabsTrigger value="preview">
              Preview{" "}
              <span className="font-mono text-caption text-muted-foreground">
                3
              </span>
            </TabsTrigger>
            <TabsTrigger value="cron" disabled>
              Cron
              <span className="rounded-sm border border-border px-1.5 text-eyebrow uppercase tracking-[0.08em]">
                Fase 06
              </span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="production" className="pt-3 text-body">
            Variables de producción.
          </TabsContent>
          <TabsContent value="preview" className="pt-3 text-body">
            Variables de preview.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Field">
        <div className="grid max-w-form gap-4">
          <FieldInput
            label="Nombre de la variable"
            help="Solo mayúsculas y guiones bajos."
            name="name"
            defaultValue="DATABASE_URL"
          />
          <FieldInput
            label="Dominio"
            error="Ese dominio ya está en uso."
            name="domain"
            defaultValue="maranatha.dev"
          />
          <FieldInput
            label="Deshabilitado"
            name="off"
            disabled
            defaultValue="solo lectura"
          />
          <FieldTextarea
            label="Valor"
            help="Nunca se muestra después de guardar."
            name="value"
          />
          <FieldCheckbox
            label="Es un secreto"
            help="El valor no se podrá leer después."
            name="secret"
          />
          <FieldCheckbox
            label="Aceptar"
            error="Debes aceptar para continuar."
            name="accept"
          />
          <FieldRadioGroup
            legend="Entorno"
            name="env"
            defaultValue="production"
            options={[
              { value: "production", label: "Producción" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </div>
      </Section>

      <Section title="Notice">
        <div className="flex flex-col gap-3">
          <Notice
            tone="info"
            title="Hay cambios sin desplegar"
            actions={<Button size="sm">Redeploy</Button>}
          >
            Las variables nuevas se aplican en el próximo despliegue.
          </Notice>
          <Notice tone="warning" title="Alerta abierta">
            El certificado de <span className="font-mono">maranatha.dev</span>{" "}
            vence en 9 días.
          </Notice>
          <Notice
            tone="destructive"
            title="No se pudo hablar con kit-agent"
            actions={
              <Button size="sm" variant="outline">
                Reintentar
              </Button>
            }
          >
            Los sitios siguen sirviendo: no dependen del panel.{" "}
            <code className="font-mono text-mono">
              systemctl status kit-agent
            </code>
          </Notice>
        </div>
      </Section>

      <Section title="EmptyState y Skeleton">
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={FolderPlus}
            title="Aún no hay proyectos"
            action={<Button>Nuevo proyecto</Button>}
          >
            Crea uno con su repo de GitHub. El primer despliegue llega con el
            siguiente push a main.
          </EmptyState>
        </div>
        <SkeletonCard title="Despliegues" />
      </Section>
    </div>
  );
}
