import { Bell } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CommandLine } from "@/components/kit/command-line";
import { RelativeTime } from "@/components/kit/relative-time";
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

/** `?pagina=N`: Auditoría's page (D063; readSettings clamps it, and an old `?antes=` link is page 1). */
async function cursor(searchParams: Search): Promise<string | undefined> {
  const { pagina } = await searchParams;
  return typeof pagina === "string" ? pagina : undefined;
}

/** Page 1 is the plain URL; the anchor keeps the reader on Auditoría. */
function auditHref(page: number): string {
  return page <= 1
    ? `${SETTINGS}#${AUDIT_ID}`
    : `${SETTINGS}?pagina=${page}#${AUDIT_ID}`;
}

const PAGER = buttonVariants({ variant: "outline" });
/** The end of the range: text, not a link, and struck through the same way as a disabled button. */
const PAGER_OFF = `${PAGER} pointer-events-none opacity-50`;

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
      <Suspense fallback={<SkeletonCard title="Alertas" />}>
        <Alerts searchParams={searchParams} />
      </Suspense>
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

/** Ajustes › Alertas (phase 06, D047): where they go, how to set them up, the last ten. The
 * Brevo key lives in /etc/kit-deploy/alerts.env (root): the panel never reads or shows it. */
async function Alerts({ searchParams }: { searchParams: Search }) {
  const data = await cursor(searchParams).then(settingsData);
  return (
    <section aria-labelledby="alertas" className="flex flex-col gap-3">
      <h2 id="alertas" className={H2}>
        Alertas
      </h2>
      <div className={CARD}>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <Bell
            aria-hidden="true"
            className="mt-0.5 size-[18px] shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-medium text-foreground">
              Por email desde alertas@fockus.dev
            </p>
            <p className="mt-1 text-muted-foreground">
              Sitio caído, certificado a menos de 14 días, disco por encima del
              80 %, memoria justa, backup fallido y despliegue fallido. Un
              correo al abrirse y otro al resolverse; las de un mismo minuto van
              juntas.
            </p>
            <p className="mt-1 text-muted-foreground">
              {data.lastEmailAt ? (
                <>
                  Último correo enviado <RelativeTime date={data.lastEmailAt} />
                  .
                </>
              ) : (
                "Aún no se ha enviado ningún correo."
              )}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground">
          La clave de Brevo y el destinatario se guardan en el servidor, nunca
          en el panel:
        </p>
        <CommandLine command="ssh -t kit-vps kit-deploy alerts setup --to <tu email>" />
        <CommandLine command="ssh kit-vps kit-deploy alerts test" />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className={H3}>Últimas alertas</h3>
        {data.alerts.length === 0 ? (
          <p className="text-muted-foreground">Ninguna todavía.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {data.alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
              >
                {a.resolvedAt ? (
                  <StatusBadge status="ready" label="Resuelta" size="table" />
                ) : (
                  <StatusBadge status="warning" label="Abierta" size="table" />
                )}
                <span className="min-w-0 flex-1 basis-48 text-foreground [overflow-wrap:anywhere]">
                  {a.title}
                </span>
                <span className="text-caption text-muted-foreground">
                  {a.kindLabel} · <RelativeTime date={a.openedAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
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
  const data = await cursor(searchParams).then(settingsData);
  const { auditPage: page, auditPages: pages } = data;
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
      </p>
      <AuditTable rows={data.audit} />
      <nav
        aria-label="Paginación de auditoría"
        className="flex flex-wrap items-center gap-3"
      >
        {page > 1 ? (
          <Link href={auditHref(page - 1)} className={PAGER}>
            Anterior
          </Link>
        ) : (
          <span aria-disabled="true" className={PAGER_OFF}>
            Anterior
          </span>
        )}
        <span className="text-muted-foreground">
          Página {page} de {pages}
        </span>
        {page < pages ? (
          <Link href={auditHref(page + 1)} className={PAGER}>
            Siguiente
          </Link>
        ) : (
          <span aria-disabled="true" className={PAGER_OFF}>
            Siguiente
          </span>
        )}
      </nav>
    </section>
  );
}
