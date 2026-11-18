/**
 * Dominios from the panel (brief F6, HANDOFF §3 Dominios): the CLI's `domain add|rm|redirect|check`
 * (lib/ops/domains.ts). A host added here needs nothing else but its DNS record: the minute timer
 * puts it in Caddy once it points to the VPS, and Caddy gets its certificate (D028, D029).
 */
import { CoreInputError } from "@/lib/core/validate";
import { AdminError } from "@/lib/db/admin";
import { webActor } from "@/lib/db/env-store";
import type { DomainRedirect } from "@/lib/db/schema";
import type { CheckLine } from "@/lib/domains/check";
import { type DnsInstructions, dnsInstructions } from "@/lib/domains/dns";
import {
  addDomain,
  checkProjectDomains,
  removeDomain,
  setDomainRedirect,
} from "@/lib/ops/domains";
import {
  domainAddSchema,
  domainRedirectSchema,
  domainRemoveSchema,
  projectOnlySchema,
} from "@/lib/panel/schemas";
import {
  type ActionResult,
  confirmationFailure,
  confirms,
  failure,
  runAction,
} from "./core";
import type { ActionDeps } from "./deps";

const page = (project: string) => `/p/${project}/domains`;

/** The host rules' refusals (lib/ops/domains.ts), with the panel's words. */
function hostRefusal(e: CoreInputError) {
  const m = e.message;
  if (/is the platform's/.test(m))
    return failure("invalid", "Ese dominio es de la plataforma.", {
      host: "Ese dominio es de la plataforma.",
    });
  if (/previews only/.test(m))
    return failure(
      "invalid",
      "Los dominios de preview.fockus.dev son solo de previews.",
      {
        host: "Los dominios de preview.fockus.dev son solo de previews.",
      },
    );
  const missing = /^(\S+) would redirect to (\S+), which is not a domain/.exec(
    m,
  );
  if (missing) {
    const [, host, to] = missing;
    return failure(
      "invalid",
      `${to} no es un dominio de este proyecto. Añade primero ${to} (sin redirección) y después ${host} con la redirección.`,
      { redirect: `Añade ${to} antes.` },
    );
  }
  // lib/domains/dns.ts redirectTarget: each redirect fits one kind of host only.
  const apexOnly = /^(\S+): to-apex is only for www\./.exec(m);
  if (apexOnly) {
    const host = apexOnly[1] ?? "";
    const why = host.startsWith("www.")
      ? `${host} está bajo un subdominio: solo www.<dominio> redirige a la versión sin www (www.tienda.com → tienda.com).`
      : `${host} no empieza por www.: no tiene versión sin www a la que redirigir.`;
    return failure("invalid", `${why} Añádelo sin redirección.`, {
      redirect: "Elige «Sirve el sitio (sin redirección)».",
    });
  }
  const wwwOnly = /^(\S+): to-www is only for a domain's apex/.exec(m);
  if (wwwOnly)
    return failure(
      "invalid",
      `${wwwOnly[1] ?? ""} no es un dominio raíz: solo un dominio como tienda.com redirige a su versión con www. Añádelo sin redirección.`,
      { redirect: "Elige «Sirve el sitio (sin redirección)»." },
    );
  return failure("invalid", "Ese dominio no es válido.", {
    host: "Ese dominio no es válido.",
  });
}

export type DomainAddResult = ActionResult<{
  host: string;
  redirect: DomainRedirect;
  /** A second submit of the same host: nothing changed. */
  already: boolean;
  /** The records to create at the DNS provider (HANDOFF "Registros DNS para <host>"). */
  dns: DnsInstructions;
}>;

export async function addProjectDomain(
  deps: ActionDeps,
  raw: unknown,
): Promise<DomainAddResult> {
  return runAction(
    deps,
    domainAddSchema,
    raw,
    { action: "domain.add" },
    async (input, user) => {
      try {
        const r = await addDomain(
          {
            admin: deps.admin,
            listDomains: (p) => deps.domains.store.list(p),
          },
          input,
          { idempotent: true, actor: webActor(user.userId) },
        );
        deps.revalidate(page(input.project));
        return {
          ok: true,
          ...r,
          dns: dnsInstructions(r.host, r.redirect),
        };
      } catch (e) {
        if (e instanceof CoreInputError) return hostRefusal(e);
        if (e instanceof AdminError && /already belongs/.test(e.message))
          return failure("conflict", `${input.host} ya es de otro proyecto.`, {
            host: "Ya es de otro proyecto.",
          });
        throw e;
      }
    },
  );
}

export type DomainRemoveResult = ActionResult<{
  host: string;
  /** Whether the live site's Caddy file was rewritten now (else its next deploy writes it). */
  site: "rewritten" | "not_live";
}>;

/** Quitar dominio: the host typed in the dialog, checked here again. */
export async function removeProjectDomain(
  deps: ActionDeps,
  raw: unknown,
): Promise<DomainRemoveResult> {
  return runAction(
    deps,
    domainRemoveSchema,
    raw,
    { action: "domain.remove" },
    async (input, user) => {
      if (!confirms(input.confirm, input.host))
        return confirmationFailure(input.host);
      let r: Awaited<ReturnType<typeof removeDomain>>;
      try {
        r = await removeDomain(deps.domains, input, {
          force: input.force,
          actor: webActor(user.userId),
        });
      } catch (e) {
        if (e instanceof CoreInputError) return hostRefusal(e);
        if (
          e instanceof AdminError &&
          /site file was not rewritten/.test(e.message)
        ) {
          deps.revalidate(page(input.project));
          return failure(
            "failed",
            `Se quitó ${input.host}, pero el sitio no se reescribió: ejecuta kit-deploy regenerate.`,
          );
        }
        throw e;
      }
      if (!r.ok) {
        if (r.reason === "default")
          return failure(
            "conflict",
            `${r.host} es el dominio por defecto de ${input.project}: marca que quieres quitarlo igualmente.`,
            { force: "Confirma que quieres quitar el dominio por defecto." },
          );
        if (r.reason === "last")
          return failure(
            "conflict",
            `${r.host} es el último dominio que sirve ${input.project}: añade otro (y que apunte) antes.`,
          );
        // A second submit: it is already gone.
        return { ok: true, host: r.host, site: "not_live" };
      }
      deps.revalidate(page(input.project));
      return { ok: true, host: r.host, site: r.site };
    },
  );
}

export type DomainRedirectResult = ActionResult<{
  host: string;
  redirectsTo: string | null;
  site: "rewritten" | "not_live";
}>;

export async function setProjectDomainRedirect(
  deps: ActionDeps,
  raw: unknown,
): Promise<DomainRedirectResult> {
  return runAction(
    deps,
    domainRedirectSchema,
    raw,
    { action: "domain.redirect" },
    async (input) => {
      try {
        const r = await setDomainRedirect(deps.domains, input);
        if (!r.ok)
          return failure(
            "not_found",
            `${r.host} no es un dominio de ${input.project}.`,
          );
        deps.revalidate(page(input.project));
        return {
          ok: true,
          host: r.host,
          redirectsTo: r.redirectsTo,
          site: r.site,
        };
      } catch (e) {
        if (e instanceof CoreInputError) return hostRefusal(e);
        throw e;
      }
    },
  );
}

export type DomainCheckResult = ActionResult<{
  checked: number;
  changed: CheckLine[];
  failed: number;
}>;

/** "Comprobar ahora": every host of the project, ready ones included. */
export async function checkProjectDomainsNow(
  deps: ActionDeps,
  raw: unknown,
): Promise<DomainCheckResult> {
  return runAction(
    deps,
    projectOnlySchema,
    raw,
    { action: "domain.check" },
    async ({ project }) => {
      const report = await checkProjectDomains(deps.domains, project);
      deps.revalidate(page(project));
      return { ok: true, ...report };
    },
  );
}
