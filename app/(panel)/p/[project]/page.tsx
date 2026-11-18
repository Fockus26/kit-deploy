export const metadata = { title: "Resumen" };

// PLACEHOLDER (CONTENT_CHECKLIST row 17): the Resumen tab (metrics, recent deployments,
// active previews, live logs) is a later wave of phase 05; provisional copy.
export default function ProjectSummary() {
  return (
    <section
      aria-labelledby="resumen"
      className="rounded-lg border border-border bg-card p-6"
    >
      <h2 id="resumen" className="mb-2 font-semibold text-foreground text-h2">
        Resumen
      </h2>
      <p className="text-muted-foreground">
        Las métricas de CPU y memoria, los últimos despliegues, los previews
        activos y los logs en vivo de este proyecto aparecerán aquí.
      </p>
    </section>
  );
}
