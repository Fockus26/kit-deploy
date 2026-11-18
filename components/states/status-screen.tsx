import type * as React from "react";

/**
 * HANDOFF §5b · 404 / 500: a short card inside the shell (or alone when there is no session).
 * `code` is the muted mono line ("404", or the request id of a 500); the title is the page's
 * only heading, so it is an h1 drawn at the h2 size of §5b.
 */
export function StatusScreen({
  code,
  title,
  children,
  actions,
}: {
  code: React.ReactNode;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-form flex-col items-start gap-3 py-12 sm:py-20">
      <p className="font-medium font-mono text-mono text-muted-foreground [overflow-wrap:anywhere]">
        {code}
      </p>
      <h1 className="font-semibold text-foreground text-h2">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
      <div className="mt-2 flex flex-wrap gap-2">{actions}</div>
    </section>
  );
}
