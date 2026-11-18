import { useId } from "react";

/** A page section (HANDOFF §3): its h2, 12px below it the content; 32px between sections is the page's. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  /** Muted text on the right of the h2 ("últimas 24 h · …"), or a link. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="font-semibold text-foreground text-h2">
          {title}
        </h2>
        {aside ? (
          <div className="text-caption text-muted-foreground">{aside}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
