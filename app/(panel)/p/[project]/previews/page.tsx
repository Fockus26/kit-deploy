import { GitPullRequest } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { Notice } from "@/components/kit/notice";
import { RelativeTime } from "@/components/kit/relative-time";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { previews } from "@/lib/panel/data";
import { previewBadge, previewsLimitText } from "@/lib/panel/resource-labels";

export const metadata = { title: "Previews" };

/** HANDOFF §3 Previews: every open PR's preview, newest push first, and the limit (D017). */
export default function PreviewsPage({
  params,
}: PageProps<"/p/[project]/previews">) {
  return (
    <>
      <h2 className="mb-1 font-semibold text-foreground text-h2">Previews</h2>
      <p className="mb-8 text-muted-foreground">
        Cada PR abierto tiene su preview, que se actualiza con cada push. Al
        cerrar el PR se apaga.
      </p>
      <Suspense fallback={<SkeletonCard title="Previews activos" rows={4} />}>
        <PreviewList params={params} />
      </Suspense>
    </>
  );
}

async function PreviewList({
  params,
}: {
  params: PageProps<"/p/[project]/previews">["params"];
}) {
  const { project } = await params;
  const data = await previews(project);
  if (!data) notFound();
  const limit = previewsLimitText(data.running, data.limit);
  return (
    <section aria-labelledby="previews-activos" className="flex flex-col gap-3">
      <h2
        id="previews-activos"
        className="font-semibold text-foreground text-h2"
      >
        Previews activos
      </h2>
      {data.previews.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            level={3}
            icon={GitPullRequest}
            title="Aún no hay previews"
          >
            Abre un PR en el repo del proyecto: su primer push despliega el
            preview en su propia dirección.
          </EmptyState>
        </div>
      ) : (
        <>
          <Notice tone="info" title={limit.title}>
            {limit.body}
          </Notice>
          <ul className="flex flex-col gap-2">
            {data.previews.map((p) => (
              <li
                key={p.pr}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
                  <p className="font-medium text-foreground">
                    <span className="font-mono">#{p.pr}</span>
                    {p.title ? ` ${p.title}` : null}
                  </p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit font-mono text-caption text-primary-text underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                  >
                    {p.host}
                    <span className="sr-only"> (abre en otra pestaña)</span>
                  </a>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                  <span className="font-mono">{p.shortSha}</span>
                  <span>
                    último push <RelativeTime date={p.lastPushAt} />
                  </span>
                </p>
                <StatusBadge status={previewBadge(p.status)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
