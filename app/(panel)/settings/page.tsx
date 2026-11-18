import { Bell } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CommandLine } from "@/components/kit/command-line";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { settingsData } from "@/lib/panel/data";
import { listProjects } from "@/lib/panel/projects";
import { panelUser } from "@/lib/panel/session";
import { AuditTable, PasskeysTable, TokensTable } from "./tables";
import { NewTokenForm } from "./token-controls";

export const metadata = { title: "Ajustes" };

const SETTINGS = "/settings";
const AUDIT_ID = "auditoria";

type Search = PageProps<"/settings">["searchParams"];

/** `?antes=<ISO date>`: the audit page cursor (settingsData ignores one that is not a date). */
async function cursor(searchParams: Search): Promise<string | undefined> {
  const { antes } = await searchParams;
  return typeof antes === "string" ? antes : undefined;
}

const H2 = "font-semibold text-foreground text-h2";
const H3 = "font-semibold text-foreground text-h3";
const CARD = "flex flex-col gap-3 rounded-lg border border-border bg-card p-5";

/** HANDOFF §3 "Ajustes": Acceso, Alertas, Tokens de despliegue, Auditoría, stacked 32px apart. */
export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-foreground text-h1">Ajustes</h1>
        {/* PLACEHOLDER (CONTENT_CHECKLIST row 34): Ajustes texts are provisional. */}
        <p className="text-muted-foreground">
          Cómo entras al panel, los tokens con los que despliega GitHub y lo que
          ha pasado.
        </p>
      </div>
      <Suspense fallback={<SkeletonCard title="Acceso" />}>
        <Access searchParams={searchParams} />
      </Suspense>
      <Alerts />
      <Suspense fallback={<SkeletonCard title="Tokens de despliegue" />}>
        <Tokens searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<SkeletonCard title="Auditoría" />}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Access({ searchParams }: { searchParams: Search }) {
  const [data, user] = await Promise.all([
    cursor(searchParams).then(settingsData),
    panelUser(),
  ]);
  // A dashboard session cannot add a factor (lib/auth/handler.ts ENROL_ONLY): a new passkey
  // comes from an enrolment link, which only César's terminal can mint.
  const enrol = `ssh -t kit-vps kit-deploy user enrol ${user.email}`;
  return (
    <section aria-labelledby="acceso" className="flex flex-col gap-3">
      <h2 id="acceso" className={H2}>
        Acceso
      </h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h3 className={H3}>Passkeys</h3>
          <PasskeysTable rows={data.passkeys} />
        </div>
        <div className={CARD}>
          <h3 className={H3}>Añadir otra passkey</h3>
          <p className="text-muted-foreground">
            Por seguridad, una sesión del panel no puede registrar factores
            nuevos. Pide un enlace de alta desde tu terminal y ábrelo en el
            dispositivo nuevo; tu app de autenticación y tus códigos siguen
            igual.
          </p>
          <CommandLine command={enrol} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          <div className={CARD}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className={H3}>App de autenticación</h3>
              {data.totp ? (
                <StatusBadge status="active" label="Activada" />
              ) : (
                <StatusBadge status="warning" label="Sin configurar" />
              )}
            </div>
            <p className="text-muted-foreground">
              {data.totp
                ? "Entra con sus 6 dígitos si no tienes la passkey a mano."
                : "Sin ella solo puedes entrar con una passkey. Configúrala con un enlace de alta."}
            </p>
          </div>
          <div className={CARD}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className={H3}>Códigos de recuperación</h3>
              {data.totp ? (
                <StatusBadge status="active" label="Activos" />
              ) : (
                <StatusBadge status="warning" label="Sin configurar" />
              )}
            </div>
            <p className="text-muted-foreground">
              Se crearon en el alta, junto con la app de autenticación. Cada
              código sirve una sola vez.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Alerts() {
  return (
    <section aria-labelledby="alertas" className="flex flex-col gap-3">
      <h2 id="alertas" className={H2}>
        Alertas
      </h2>
      {/* PLACEHOLDER (CONTENT_CHECKLIST row 33): disabled until phase 06 brings the alerts. */}
      <div
        aria-disabled="true"
        className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-5 text-muted-foreground"
      >
        <Bell aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" />
        <div className="min-w-48 flex-1">
          <p className="font-medium">Llega en la fase 06</p>
          <p className="mt-1">
            Aquí se configurarán los avisos por email cuando algo falle en un
            despliegue o en el servidor.
          </p>
        </div>
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-medium text-eyebrow uppercase tracking-[0.08em]">
          Fase 06
        </span>
      </div>
    </section>
  );
}

async function Tokens({ searchParams }: { searchParams: Search }) {
  const [data, projects] = await Promise.all([
    cursor(searchParams).then(settingsData),
    listProjects(),
  ]);
  return (
    <section aria-labelledby="tokens" className="flex flex-col gap-3">
      <h2 id="tokens" className={H2}>
        Tokens de despliegue
      </h2>
      <p className="text-muted-foreground">
        GitHub Actions los usa para desplegar. El panel solo guarda su huella:
        un token se ve una vez, al crearlo.
      </p>
      <TokensTable rows={data.tokens} />
      <NewTokenForm projects={projects.map((p) => p.name)} />
    </section>
  );
}

async function Audit({ searchParams }: { searchParams: Search }) {
  const before = await cursor(searchParams);
  const data = await settingsData(before);
  const since = before ? new Date(before) : null;
  const paged = since !== null && !Number.isNaN(+since);
  return (
    <section
      id={AUDIT_ID}
      aria-labelledby="auditoria-titulo"
      className="flex scroll-mt-header flex-col gap-3"
    >
      <h2 id="auditoria-titulo" className={H2}>
        Auditoría
      </h2>
      <p className="text-muted-foreground">
        Quién hizo qué y cuándo, desde el panel o la CLI. Solo nombres, nunca
        valores.
        {paged ? " Estás viendo registros anteriores." : ""}
      </p>
      <AuditTable rows={data.audit} />
      {paged || data.auditNext ? (
        <nav
          aria-label="Páginas de la auditoría"
          className="flex flex-wrap gap-2"
        >
          {paged ? (
            <Link
              href={`${SETTINGS}#${AUDIT_ID}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Volver a los más recientes
            </Link>
          ) : null}
          {data.auditNext ? (
            <Link
              href={`${SETTINGS}?antes=${encodeURIComponent(data.auditNext.toISOString())}#${AUDIT_ID}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Cargar más
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
