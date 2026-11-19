import { Suspense } from "react";
import { SkeletonCard } from "@/components/kit/skeleton-card";
import { githubReadTokenFromEnv, listRepos } from "@/lib/github/repos";
import { panelUser } from "@/lib/panel/session";
import { NewProjectForm } from "./new-project-form";

export const metadata = { title: "Nuevo proyecto" };

/** HANDOFF §3 "Nuevo proyecto": the form in a card (max 560), then its token, shown once. */
export default function NewProjectPage() {
  return (
    <div className="flex max-w-form-wide flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-foreground text-h1">
          Nuevo proyecto
        </h1>
        {/* PLACEHOLDER (CONTENT_CHECKLIST row 32): provisional copy until César confirms it. */}
        <p className="text-muted-foreground">
          Conecta un repositorio de GitHub. Al crearlo recibes su token de
          despliegue, una sola vez.
        </p>
      </div>
      <Suspense fallback={<SkeletonCard title="Datos del proyecto" rows={4} />}>
        <Form />
      </Suspense>
    </div>
  );
}

/**
 * The repo list is read here, at request time (D061): the read-only token stays on the server
 * and only each repo's name, visibility, last push and default branch reach the form. The whole
 * form waits for it (cached 5 min), so a field never swaps under the cursor.
 */
async function Form() {
  // Signed in first (it also awaits connection(): the env is read per request, not at build).
  await panelUser();
  const repos = await listRepos(githubReadTokenFromEnv());
  return <NewProjectForm repos={repos} />;
}
