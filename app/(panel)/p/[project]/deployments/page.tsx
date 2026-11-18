import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { DeploymentFilters } from "@/components/panel/deployment-filters";
import { DeploymentSheet } from "@/components/panel/deployment-sheet";
import { DeploymentsTable } from "@/components/panel/deployments-table";
import { Section } from "@/components/panel/section";
import { DEPLOYMENT_STATUSES, type DeploymentStatus } from "@/lib/db/schema";
import { deploymentsHref } from "@/lib/kit/deployments-url";
import {
  deploymentDetail,
  deployments,
  projectOverview,
} from "@/lib/panel/data";

export const metadata = { title: "Despliegues" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** HANDOFF §3 Despliegues: filters, the full table, and a deployment's detail in a right Sheet. */
export default function DeploymentsPage({
  params,
  searchParams,
}: PageProps<"/p/[project]/deployments">) {
  return (
    <Suspense fallback={<SkeletonCard title="Despliegues" rows={4} />}>
      <Deployments params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Deployments({
  params,
  searchParams,
}: Pick<PageProps<"/p/[project]/deployments">, "params" | "searchParams">) {
  const [{ project: name }, query] = await Promise.all([params, searchParams]);
  const env = one(query.env) === "preview" ? "preview" : "production";
  const rawStatus = one(query.status);
  const status = DEPLOYMENT_STATUSES.includes(rawStatus as DeploymentStatus)
    ? (rawStatus as DeploymentStatus)
    : undefined;
  const rawId = one(query.d);
  const id = rawId && UUID.test(rawId) ? rawId : undefined;

  const [overview, data] = await Promise.all([
    projectOverview(name),
    deployments(name, env, status),
  ]);
  if (!overview || !data) notFound();

  const closeHref = deploymentsHref(name, env, status);
  const detailBase = closeHref;
  const liveSha = overview.live?.shortSha ?? null;

  return (
    <Section title="Despliegues">
      <DeploymentFilters
        project={name}
        env={env}
        status={status}
        counts={data.counts}
      >
        <DeploymentsTable
          project={name}
          items={data.deployments}
          liveSha={liveSha}
          detailBase={detailBase}
          selectedId={id}
          branch={overview.project.productionBranch}
        />
      </DeploymentFilters>
      {id ? (
        <Suspense fallback={null}>
          <Detail
            project={name}
            id={id}
            liveSha={liveSha}
            closeHref={closeHref}
          />
        </Suspense>
      ) : null}
    </Section>
  );
}

async function Detail({
  project,
  id,
  liveSha,
  closeHref,
}: {
  project: string;
  id: string;
  liveSha: string | null;
  closeHref: string;
}) {
  const detail = await deploymentDetail(project, id);
  if (!detail) return null;
  return (
    <DeploymentSheet
      project={project}
      detail={detail}
      liveSha={liveSha}
      closeHref={closeHref}
    />
  );
}
