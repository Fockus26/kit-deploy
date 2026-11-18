import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { domainsData } from "@/lib/panel/data";
import { certText } from "@/lib/panel/resource-labels";
import { type DomainRow, DomainsManager } from "./domains-manager";

export const metadata = { title: "Dominios" };

/** HANDOFF §3 Dominios: the table, "Añadir dominio" and the DNS records of a host. */
export default function DomainsPage({
  params,
}: PageProps<"/p/[project]/domains">) {
  return (
    <>
      <h1 className="mb-1 font-semibold text-foreground text-h1">Dominios</h1>
      <p className="mb-8 max-w-3xl text-muted-foreground">
        Cada minuto se comprueba el DNS de los dominios pendientes: en cuanto
        uno apunta al servidor, su certificado se emite solo.
      </p>
      <Suspense fallback={<SkeletonCard title="Dominios" rows={4} />}>
        <Domains params={params} />
      </Suspense>
    </>
  );
}

async function Domains({
  params,
}: {
  params: PageProps<"/p/[project]/domains">["params"];
}) {
  const { project } = await params;
  const data = await domainsData(project);
  if (!data) notFound();
  // The certificate's words are fixed here, on one clock: the browser's could cross a day.
  const now = new Date();
  const rows: DomainRow[] = data.domains.map((d) => ({
    ...d,
    certLabel: certText(d.certTone, d.certNotAfter, now),
  }));
  return (
    <DomainsManager
      project={project}
      domains={rows}
      lastCheckedAt={data.lastCheckedAt}
    />
  );
}
