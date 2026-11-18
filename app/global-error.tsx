"use client";

import "./globals.css";
import { digestOf } from "@/components/states/digest";
import { THEME_SCRIPT } from "@/lib/theme";

/**
 * The last resort: an error in the root layout itself, so it brings its own document and styles
 * (the panel's tokens, system fonts). Minimal on purpose: no shell, no data.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest = digestOf(error);
  return (
    <html lang="es" suppressHydrationWarning className="h-full antialiased">
      <head>
        <title>Algo falló · kit-deploy</title>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant from lib/theme.ts, no input
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="flex min-h-full items-center justify-center bg-background p-4 text-foreground">
        <main className="w-full max-w-form rounded-lg border border-border bg-card p-6">
          {digest ? (
            <p className="mb-2 font-mono text-mono text-muted-foreground [overflow-wrap:anywhere]">
              Petición {digest}
            </p>
          ) : null}
          <h1 className="mb-2 font-semibold text-h2">Algo falló en el panel</h1>
          <p className="mb-4 text-muted-foreground">
            Los sitios siguen sirviendo: no dependen del panel.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex min-h-control items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
