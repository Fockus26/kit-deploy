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
      <NewProjectForm />
    </div>
  );
}
