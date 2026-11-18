import { Layers } from "lucide-react";
import type * as React from "react";

/**
 * The frame of /login and /enrol (HANDOFF §3 "Login"): a card of 400px max, centred on
 * `--background`, with the panel's logo on top. Same tokens as the shell; the theme is the
 * panel's (dark by default, D007), set on <html> before paint.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-form rounded-lg border border-border bg-card p-6">
        <p className="mb-6 inline-flex items-center gap-2 font-semibold text-foreground text-h2">
          <Layers aria-hidden="true" className="size-4 text-primary" />
          kit-deploy
        </p>
        {children}
      </div>
    </main>
  );
}
