import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { ENVIRONMENTS } from "@/lib/core/env";
import { envList } from "@/lib/panel/data";
import { EnvManager } from "./env-manager";

export const metadata = { title: "Variables" };

/**
 * HANDOFF §3 Variables. A secret's value never reaches this page: the reader's row type has no
 * value field for it, and the form never gets one back.
 */
export default function EnvPage({ params }: PageProps<"/p/[project]/env">) {
  return (
    <>
      <h2 className="mb-1 font-semibold text-foreground text-h2">Variables</h2>
      <p className="mb-8 max-w-3xl text-muted-foreground">
        Cifradas en el servidor. Las secretas nunca se vuelven a mostrar: solo
        se pueden reemplazar.
      </p>
      <Suspense fallback={<SkeletonCard title="Variables" rows={5} />}>
        <Variables params={params} />
      </Suspense>
    </>
  );
}

async function Variables({
  params,
}: {
  params: PageProps<"/p/[project]/env">["params"];
}) {
  const { project } = await params;
  // One list per tab: the counters and the switch between tabs need no new request.
  const lists = await Promise.all(ENVIRONMENTS.map((e) => envList(project, e)));
  const [production, preview, development] = lists;
  if (!production || !preview || !development) notFound();
  return (
    <EnvManager
      project={project}
      lists={{ production, preview, development }}
    />
  );
}
