import { useId } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Widths of the bars (HANDOFF §2: 45–85 %), cycled so a list does not look like a barcode. */
const WIDTHS = ["w-4/5", "w-3/5", "w-[85%]", "w-[45%]", "w-2/3"] as const;

/**
 * Loading state of a section (HANDOFF §5b): the real h2 stays visible, the bars wait inside the
 * card; the container is `aria-busy` and the title says "Cargando …".
 */
export function SkeletonCard({
  title,
  rows = 3,
}: {
  /** The section's real title, e.g. "Despliegues". */
  title: string;
  rows?: number;
}) {
  const titleId = useId();
  return (
    <section
      aria-busy="true"
      aria-labelledby={titleId}
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id={titleId} className="font-semibold text-h2">
        {title}
        <span className="sr-only"> — cargando</span>
      </h2>
      <p className="mt-1 text-caption text-muted-foreground">
        Cargando {title.toLowerCase()}…
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
          <Skeleton key={i} className={`h-3.5 ${WIDTHS[i % WIDTHS.length]}`} />
        ))}
      </div>
    </section>
  );
}
